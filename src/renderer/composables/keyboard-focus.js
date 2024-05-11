/**
 * @license
 * This software includes material derived from Keyboard Focus: https://github.com/jonathantneal/keyboard-focus
 * This work is distributed under the W3C® Software License [1]
 * in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * [1] https://www.w3.org/copyright/software-license-2015/
 */

import { onMounted, onUnmounted, getCurrentInstance } from 'vue'

/**
 * Adds a keyboard-focus attribute to any focused element that is given focus by a keyboard
 */
export default function useKeyboardFocus() {
  let hadKeyboardEvent = true
  let hadFocusVisibleRecently = false
  let hadFocusVisibleRecentlyTimeout = null
  let currentElement = null

  /**
   * On `keydown`, set `hadKeyboardEvent`.
   * @param {Event} event
   */
  function onKeyDown(event) {
    // Ignore keypresses if the user is holding down a modifier key.
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      hadKeyboardEvent = true
    }
  }

  /**
   * If at any point a user clicks with a pointing device, ensure that we change
   * the modality away from keyboard.
   */
  function onPointerDown() {
    hadKeyboardEvent = false
  }

  /**
   * On `focus`, add the `keyboard-focus` attribute to the target if the
   * target received focus as a result of keyboard navigation
   * @param {Event} event
   */
  function onFocus(event) {
    // Prevent IE from focusing the document or HTML element.
    if (event.target !== document && event.target.nodeName !== 'HTML' && hadKeyboardEvent) {
      event.target.setAttribute('keyboard-focus', '')
      hadKeyboardEvent = false
    }
  }

  /**
   * On `blur`, remove the `keyboard-focus` attribute from the target.
   * @param {Event} event
   */
  function onBlur(event) {
    if (event.target === document || event.target.nodeName === 'HTML') {
      return
    }

    if (event.target.hasAttribute('keyboard-focus')) {
      // To detect a tab/window switch, we look for a blur event followed
      // rapidly by a visibility change.
      // If we don't see a visibility change within 100ms, it's probably
      // a regular focus change.
      hadFocusVisibleRecently = true

      clearTimeout(hadFocusVisibleRecentlyTimeout)

      hadFocusVisibleRecentlyTimeout = setTimeout(() => {
        hadFocusVisibleRecently = false
        clearTimeout(hadFocusVisibleRecentlyTimeout)
      }, 100)

      event.target.removeAttribute('keyboard-focus')
    }
  }

  /**
   * If the user changes tabs, keep track of whether or not keyboard had
   * recently triggered focus.
   */
  function onWindowBlur() {
    // If the tab becomes active again, the browser will handle calling
    // focus on the element (Safari actually calls it twice).
    // If this tab change caused a blur, re-enable keyboard focus
    if (hadFocusVisibleRecently) {
      hadKeyboardEvent = true
    }

    addInitialPointerMoveListeners()
  }

  /**
   * Add a group of listeners to detect usage of any pointing devices.
   * These listeners will be added when the polyfill first loads, and anytime
   * the window is blurred, so that they are active when the window regains
   * focus.
   */
  function addInitialPointerMoveListeners() {
    currentElement.addEventListener('mousemove', onInitialPointerMove)
    currentElement.addEventListener('mousedown', onInitialPointerMove)
    currentElement.addEventListener('mouseup', onInitialPointerMove)
    currentElement.addEventListener('pointermove', onInitialPointerMove)
    currentElement.addEventListener('pointerdown', onInitialPointerMove)
    currentElement.addEventListener('pointerup', onInitialPointerMove)
    currentElement.addEventListener('touchmove', onInitialPointerMove)
    currentElement.addEventListener('touchstart', onInitialPointerMove)
    currentElement.addEventListener('touchend', onInitialPointerMove)
  }

  function removeInitialPointerMoveListeners() {
    currentElement.removeEventListener('mousedown', onInitialPointerMove)
    currentElement.removeEventListener('mousemove', onInitialPointerMove)
    currentElement.removeEventListener('mouseup', onInitialPointerMove)
    currentElement.removeEventListener('pointermove', onInitialPointerMove)
    currentElement.removeEventListener('pointerdown', onInitialPointerMove)
    currentElement.removeEventListener('pointerup', onInitialPointerMove)
    currentElement.removeEventListener('touchmove', onInitialPointerMove)
    currentElement.removeEventListener('touchstart', onInitialPointerMove)
    currentElement.removeEventListener('touchend', onInitialPointerMove)
  }

  /**
   * When the library first loads, assume the user is in keyboard modality.
   * If any event is received from a pointing device (e.g. mouse, pointer,
   * touch), turn off keyboard modality.
   * This accounts for situations where focus enters the page from the URL bar.
   * @param {Event} event
   */
  function onInitialPointerMove(event) {
    // Work around a Safari quirk that fires a mousemove on <html> whenever the
    // window blurs, even if you're tabbing out of the page. ¯\_(ツ)_/¯
    if (event.target.nodeName !== 'HTML') {
      hadKeyboardEvent = false
      removeInitialPointerMoveListeners()
    }
  }

  /**
   * Initialize event listeners
   */
  function mount() {
    currentElement = getCurrentInstance().proxy.$el

    currentElement.addEventListener('keydown', onKeyDown, true)
    currentElement.addEventListener('mousedown', onPointerDown, true)
    currentElement.addEventListener('pointerdown', onPointerDown, true)
    currentElement.addEventListener('touchstart', onPointerDown, true)
    currentElement.addEventListener('focus', onFocus, true)
    currentElement.addEventListener('blur', onBlur, true)
    window.addEventListener('blur', onWindowBlur)

    addInitialPointerMoveListeners()
  }

  /**
   * Remove event listeners
   */
  function unmount() {
    currentElement.removeEventListener('keydown', onKeyDown, true)
    currentElement.removeEventListener('mousedown', onPointerDown, true)
    currentElement.removeEventListener('pointerdown', onPointerDown, true)
    currentElement.removeEventListener('touchstart', onPointerDown, true)
    currentElement.removeEventListener('focus', onFocus, true)
    currentElement.removeEventListener('blur', onBlur, true)
    window.removeEventListener('blur', onWindowBlur)

    removeInitialPointerMoveListeners()
  }

  onMounted(mount)
  onUnmounted(unmount)
}
