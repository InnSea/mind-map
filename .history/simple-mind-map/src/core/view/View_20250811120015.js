const {
  customHandleMousewheel,
  mousewheelAction,
  mouseScaleCenterUseMousePosition,
  mousewheelMoveStep,
  mousewheelZoomActionReverse,
  disableMouseWheelZoom,
  translateRatio
} = this.mindMap.opt
// 是否自定义鼠标滚轮事件
if (
  customHandleMousewheel &&
  typeof customHandleMousewheel === 'function'
) {
  return customHandleMousewheel(e)
}
// 1.鼠标滚轮事件控制缩放
if (
  mousewheelAction === CONSTANTS.MOUSE_WHEEL_ACTION.ZOOM ||
  e.ctrlKey ||
  e.metaKey
) {
  if (disableMouseWheelZoom) return
  const { x: clientX, y: clientY } = this.mindMap.toPos(
    e.clientX,
    e.clientY
  )
  const cx = mouseScaleCenterUseMousePosition ? clientX : undefined
  const cy = mouseScaleCenterUseMousePosition ? clientY : undefined
  // 如果来自触控板，那么过滤掉左右的移动
  if (
    isTouchPad &&
    (dirs.includes(CONSTANTS.DIR.LEFT) ||
      dirs.includes(CONSTANTS.DIR.RIGHT))
  ) {
    dirs = dirs.filter(dir => {
      return ![CONSTANTS.DIR.LEFT, CONSTANTS.DIR.RIGHT].includes(dir)
    })
  }
  switch (true) {
    // 鼠标滚轮，向上和向左，都是缩小
    case dirs.includes(CONSTANTS.DIR.UP || CONSTANTS.DIR.LEFT):
      mousewheelZoomActionReverse
        ? this.enlarge(cx, cy, isTouchPad)
        : this.narrow(cx, cy, isTouchPad)
      break
    // 鼠标滚轮，向下和向右，都是放大
    case dirs.includes(CONSTANTS.DIR.DOWN || CONSTANTS.DIR.RIGHT):
      mousewheelZoomActionReverse
        ? this.narrow(cx, cy, isTouchPad)
        : this.enlarge(cx, cy, isTouchPad)
      break
  }
} else {
  // 2.鼠标滚轮事件控制画布移动
  let stepX = 0
  let stepY = 0
  if (isTouchPad) {
    // 如果是触控板，那么直接使用触控板滑动距离
    stepX = Math.abs(e.wheelDeltaX)
    stepY = Math.abs(e.wheelDeltaY)
  } else {
    stepX = stepY = mousewheelMoveStep
  }
  let mx = 0
  let my = 0
  // 上移
  if (dirs.includes(CONSTANTS.DIR.DOWN)) {
    my = -stepY
  }
  // 下移
  if (dirs.includes(CONSTANTS.DIR.UP)) {
    my = stepY
  }
  // 右移
  if (dirs.includes(CONSTANTS.DIR.LEFT)) {
    mx = stepX
  }
  // 左移
  if (dirs.includes(CONSTANTS.DIR.RIGHT)) {
    mx = -stepX
  }
  this.translateXY(mx * translateRatio, my * translateRatio)
}