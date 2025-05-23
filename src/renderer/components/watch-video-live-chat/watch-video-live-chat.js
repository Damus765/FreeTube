import { defineComponent, nextTick } from 'vue'
import FtLoader from '../FtLoader/FtLoader.vue'
import FtCard from '../ft-card/ft-card.vue'
import FtButton from '../FtButton/FtButton.vue'

import autolinker from 'autolinker'
import { getRandomColorClass } from '../../helpers/colors'
import { getLocalVideoInfo, parseLocalTextRuns } from '../../helpers/api/local'
import { formatNumber } from '../../helpers/utils'

export default defineComponent({
  name: 'WatchVideoLiveChat',
  components: {
    'ft-loader': FtLoader,
    'ft-card': FtCard,
    'ft-button': FtButton
  },
  props: {
    liveChat: {
      type: EventTarget,
      default: null
    },
    videoId: {
      type: String,
      required: true
    },
    channelId: {
      type: String,
      required: true
    }
  },
  data: function () {
    return {
      /** @type {import('youtubei.js').YT.LiveChat|null} */
      liveChatInstance: null,
      isLoading: true,
      hasError: false,
      hasEnded: false,
      showEnableChat: false,
      errorMessage: '',
      stayAtBottom: true,
      showSuperChat: false,
      showScrollToBottom: false,
      comments: [],
      superChatComments: [],
      superChat: {
        id: '',
        author: {
          name: '',
          thumbnailUrl: ''
        },
        message: '',
        superChat: {
          amount: '',
          colorClass: ''
        }
      },
      /** @type {number|null} */
      watchingCount: null,
    }
  },
  computed: {
    backendPreference: function () {
      return this.$store.getters.getBackendPreference
    },

    backendFallback: function () {
      return this.$store.getters.getBackendFallback
    },

    chatHeight: function () {
      if (this.superChatComments.length > 0) {
        return '390px'
      } else {
        return '445px'
      }
    },

    scrollingBehaviour: function () {
      return this.$store.getters.getDisableSmoothScrolling ? 'auto' : 'smooth'
    },

    hideVideoViews: function () {
      return this.$store.getters.getHideVideoViews
    },

    formattedWatchingCount: function () {
      return this.watchingCount !== null ? formatNumber(this.watchingCount) : '0'
    }
  },
  beforeDestroy: function () {
    this.hasEnded = true
    this.liveChatInstance?.stop()
    this.liveChatInstance = null
  },
  created: function () {
    if (!process.env.SUPPORTS_LOCAL_API) {
      this.hasError = true
      this.errorMessage = this.$t('Video["Live Chat is currently not supported in this build."]')
      this.isLoading = false
    } else {
      switch (this.backendPreference) {
        case 'local':
          if (this.liveChat) {
            this.liveChatInstance = this.liveChat
            this.startLiveChatLocal()
          } else {
            this.showLiveChatUnavailable()
          }
          break
        case 'invidious':
          if (this.backendFallback) {
            this.getLiveChatLocal()
          } else {
            this.hasError = true
            this.errorMessage = this.$t('Video["Live Chat is currently not supported with the Invidious API. A direct connection to YouTube is required."]')
            this.showEnableChat = true
            this.isLoading = false
          }
          break
      }
    }
  },
  methods: {
    enableLiveChat: function () {
      this.hasError = false
      this.showEnableChat = false
      this.isLoading = true
      this.getLiveChatLocal()
    },

    getLiveChatLocal: async function () {
      const videoInfo = await getLocalVideoInfo(this.videoId)

      if (videoInfo.livechat) {
        this.liveChatInstance = videoInfo.getLiveChat()

        this.startLiveChatLocal()
      } else {
        this.showLiveChatUnavailable()
      }
    },

    showLiveChatUnavailable: function () {
      this.hasError = true
      this.errorMessage = this.$t('Video["Live Chat is unavailable for this stream. It may have been disabled by the uploader."]')
      this.isLoading = false
      this.showEnableChat = false
    },

    startLiveChatLocal: function () {
      this.liveChatInstance.once('start', initialData => {
        /**
         * @type {import ('youtubei.js/dist/src/parser/index').LiveChatContinuation}
         */
        const liveChatContinuation = initialData

        const actions = liveChatContinuation.actions.filter(action => action.type === 'AddChatItemAction')

        for (const { item } of actions) {
          switch (item.type) {
            case 'LiveChatTextMessage':
              this.parseLiveChatComment(item)
              break
            case 'LiveChatPaidMessage':
              this.parseLiveChatSuperChat(item)
          }
        }

        this.isLoading = false

        nextTick(() => {
          this.$refs.liveChatComments?.scrollTo({
            top: this.$refs.liveChatComments.scrollHeight,
            behavior: 'instant'
          })
        })
      })

      this.liveChatInstance.on('chat-update', action => {
        if (this.hasEnded) {
          return
        }
        if (action.type === 'AddChatItemAction') {
          switch (action.item.type) {
            case 'LiveChatTextMessage':
              this.parseLiveChatComment(action.item)
              break
            case 'LiveChatPaidMessage':
              this.parseLiveChatSuperChat(action.item)
              break
          }
        }
      })

      this.liveChatInstance.on('metadata-update', metadata => {
        if (!this.hideVideoViews && metadata.views && !isNaN(metadata.views.original_view_count)) {
          this.watchingCount = metadata.views.original_view_count
        }
      })

      this.liveChatInstance.once('end', () => {
        this.hasEnded = true
        this.liveChatInstance = null
      })

      this.liveChatInstance.once('error', error => {
        this.liveChatInstance.stop()
        this.liveChatInstance = null
        console.error(error)
        this.errorMessage = error
        this.hasError = true
        this.isLoading = false
        this.hasEnded = true
      })

      this.liveChatInstance.start()
    },

    /**
     * @param {import('youtubei.js').YTNodes.LiveChatTextMessage} comment
     */
    parseLiveChatComment: function (comment) {
      /**
       * can also be undefined if there is no badge
       * @type {import('youtubei.js').YTNodes.LiveChatAuthorBadge}
       */
      const badge = comment.author.badges.find(badge => badge.type === 'LiveChatAuthorBadge' && badge.custom_thumbnail)

      const parsedComment = {
        message: autolinker.link(parseLocalTextRuns(comment.message.runs, 20)),
        author: {
          name: comment.author.name,
          thumbnailUrl: comment.author.thumbnails.at(-1).url,
          isOwner: comment.author.id === this.channelId,
          isModerator: comment.author.is_moderator,
          isMember: !!badge
        }
      }

      if (badge) {
        parsedComment.badge = {
          url: badge.custom_thumbnail.at(-1)?.url,
          tooltip: badge.tooltip ?? ''
        }
      }

      this.pushComment(parsedComment)
    },

    /**
     * @param {import('youtubei.js').YTNodes.LiveChatPaidMessage} superChat
     */
    parseLiveChatSuperChat: function (superChat) {
      const parsedComment = {
        id: superChat.id,
        message: autolinker.link(parseLocalTextRuns(superChat.message.runs, 20)),
        author: {
          name: superChat.author.name.text,
          thumbnailUrl: superChat.author.thumbnails[0].url
        },
        superChat: {
          amount: superChat.purchase_amount,
          colorClass: getRandomColorClass()
        }
      }

      this.superChatComments.unshift(parsedComment)

      setTimeout(() => {
        this.removeFromSuperChat(parsedComment.id)
      }, 120000)

      this.pushComment(parsedComment)
    },

    pushComment: function (comment) {
      this.comments.push(comment)

      if (!this.isLoading && this.stayAtBottom) {
        nextTick(() => {
          this.$refs.liveChatComments?.scrollTo({
            top: this.$refs.liveChatComments.scrollHeight,
            behavior: this.scrollingBehaviour
          })
        })
      }

      if (this.comments.length > 150 && this.stayAtBottom) {
        this.comments = this.comments.splice(this.comments.length - 150, this.comments.length)
      }
    },

    removeFromSuperChat: function (id) {
      this.superChatComments = this.superChatComments.filter((comment) => {
        return comment.id !== id
      })
    },

    showSuperChatComment: function (comment) {
      if (this.superChat.id === comment.id && this.showSuperChat) {
        this.showSuperChat = false
      } else {
        this.superChat = comment
        this.showSuperChat = true
      }
    },

    onScroll: function (event, isScrollEnd = false) {
      const liveChatComments = this.$refs.liveChatComments
      if (event.wheelDelta >= 0 && this.stayAtBottom) {
        this.stayAtBottom = false

        if (liveChatComments.scrollHeight > liveChatComments.clientHeight) {
          this.showScrollToBottom = true
        }
      } else if ((isScrollEnd || event.wheelDelta < 0) && !this.stayAtBottom && (liveChatComments.scrollHeight - liveChatComments.scrollTop) === liveChatComments.clientHeight) {
        this.scrollToBottom()
      }
    },

    scrollToBottom: function () {
      this.$refs.liveChatComments.scrollTo({
        top: this.$refs.liveChatComments.scrollHeight,
        behavior: this.scrollingBehaviour
      })
      this.stayAtBottom = true
      this.showScrollToBottom = false
    }
  }
})
