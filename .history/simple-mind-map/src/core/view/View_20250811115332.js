import { CONSTANTS } from '../../constants/constant'

//  视图操作类
class View {
  //  构造函数
  constructor(opt = {}) {
    this.opt = opt
    this.mindMap = this.opt.mindMap
    this.scale = 1
    this.sx = 0
    this.sy = 0
    this.x = 0
    this.y = 0
    this.firstDrag = true
    // 触控板滚动惯性相关状态
    this._wheelVX = 0
    this._wheelVY = 0
    this._wheelAnimating = false
    this._wheelRAF = 0
    // 触控板轴锁定状态（x | y），以及锁定时间戳（用于滞回）
    this._wheelAxis = null
    this._wheelAxisLockTS = 0
    this.setTransformData(this.mindMap.opt.viewData)
    this.bind()
  }

  //  绑定
  bind() {
    // 快捷键
    this.mindMap.keyCommand.addShortcut('Control+=', () => {
      this.enlarge()
    })
    this.mindMap.keyCommand.addShortcut('Control+-', () => {
      this.narrow()
    })
    this.mindMap.keyCommand.addShortcut('Control+i', () => {
      this.fit()
    })
    // 拖动视图
    this.mindMap.event.on('mousedown', e => {
      const { isDisableDrag, mousedownEventPreventDefault } = this.mindMap.opt
      if (isDisableDrag) return
      if (mousedownEventPreventDefault) {
        e.preventDefault()
      }
      this.sx = this.x
      this.sy = this.y
    })
    this.mindMap.event.on('drag', (e, event) => {
      // 按住ctrl键拖动为多选
      // 禁用拖拽
      if (e.ctrlKey || e.metaKey || this.mindMap.opt.isDisableDrag) {
        return
      }
      if (this.firstDrag) {
        this.firstDrag = false
        // 清除激活节点
        if (this.mindMap.renderer.activeNodeList.length > 0) {
          this.mindMap.execCommand('CLEAR_ACTIVE_NODE')
        }
      }
      this.x = this.sx + event.mousemoveOffset.x
      this.y = this.sy + event.mousemoveOffset.y
      this.transform()
    })
    this.mindMap.event.on('mouseup', () => {
      this.firstDrag = true
    })
    // 放大缩小视图
    this.mindMap.event.on('mousewheel', (e, dirs, event, isTouchPad) => {
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
          // 触控板：使用标准delta并进行平滑惯性滚动（加入死区和轴锁定，抑制横向抖动）
          let deltaX = 'deltaX' in e ? e.deltaX : 0
          let deltaY = 'deltaY' in e ? e.deltaY : 0
          // 统一单位为像素：deltaMode=0:像素; 1:行; 2:页（粗略换算）
          const LINE_PX = 16
          if (e.deltaMode === 1) {
            deltaX *= LINE_PX
            deltaY *= LINE_PX
          } else if (e.deltaMode === 2) {
            deltaX *= LINE_PX * 20
            deltaY *= LINE_PX * 20
          }
          // 小幅噪声过滤（横向更严格）
          const DEADZONE_X = 1.2
          const DEADZONE_Y = 0.6
          if (Math.abs(deltaX) < DEADZONE_X) deltaX = 0
          if (Math.abs(deltaY) < DEADZONE_Y) deltaY = 0
          // 基于方向判定意图：仅有上下时强制纵向，仅有左右时强制横向
          const hasH =
            dirs.includes(CONSTANTS.DIR.LEFT) ||
            dirs.includes(CONSTANTS.DIR.RIGHT)
          const hasV =
            dirs.includes(CONSTANTS.DIR.UP) || dirs.includes(CONSTANTS.DIR.DOWN)
          if (hasV && !hasH) {
            deltaX = 0
            this._wheelAxis = 'y'
            this._wheelVX = 0
          } else if (hasH && !hasV) {
            deltaY = 0
            this._wheelAxis = 'x'
            this._wheelVY = 0
          }
          // 进一步强制：只要本次事件存在纵向量且未按住Shift，忽略横向量（彻底避免上下滑时横向偏移）
          if (!e.shiftKey && Math.abs(deltaY) > 0) {
            deltaX = 0
            this._wheelAxis = 'y'
            this._wheelVX = 0
          }
          // 严格轴锁定 + 滞回：以当前主导轴为准，一段时间内忽略另一轴输入
          const now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now()
          const LOCK_WINDOW = 220 // ms（更长滞回，降低误切轴）
          const SWITCH_RATIO = 2.0 // 允许切换轴所需的强度比例（更严格）
          // 如果未锁定或锁定过期，则按当前更大值确定轴
          if (!this._wheelAxis || now - this._wheelAxisLockTS > LOCK_WINDOW) {
            if (Math.abs(deltaY) >= Math.abs(deltaX)) {
              this._wheelAxis = 'y'
              this._wheelVX = 0 // 清理另一轴的历史惯性
            } else {
              this._wheelAxis = 'x'
              this._wheelVY = 0
            }
            this._wheelAxisLockTS = now
          } else {
            // 已锁定，判断是否需要切换轴（只有明显占优时才切换）
            if (
              this._wheelAxis === 'y' &&
              Math.abs(deltaX) > Math.abs(deltaY) * SWITCH_RATIO
            ) {
              this._wheelAxis = 'x'
              this._wheelVY = 0
              this._wheelAxisLockTS = now
            } else if (
              this._wheelAxis === 'x' &&
              Math.abs(deltaY) > Math.abs(deltaX) * SWITCH_RATIO
            ) {
              this._wheelAxis = 'y'
              this._wheelVX = 0
              this._wheelAxisLockTS = now
            }
          }
          // 应用锁定：只保留锁定轴上的位移
          let lockX = false
          let lockY = false
          if (this._wheelAxis === 'y') {
            deltaX = 0
            lockX = true
          } else if (this._wheelAxis === 'x') {
            deltaY = 0
            lockY = true
          }
          // 将浏览器滚动方向映射为画布位移方向：滚下(deltaY>0) => 画布向上（-），向右(deltaX>0) => 画布向左（-）
          const dx = -deltaX * translateRatio
          const dy = -deltaY * translateRatio
          // 若锁定某轴，清空该轴的惯性，避免历史速度导致侧向跳动
          if (lockX) this._wheelVX = 0
          if (lockY) this._wheelVY = 0
          this._smoothWheelTranslate(dx, dy)
        } else {
          // 普通鼠标滚轮：保持原有按步长移动
          stepX = stepY = mousewheelMoveStep
          let mx = 0
          let my = 0
          if (dirs.includes(CONSTANTS.DIR.DOWN)) {
            my = -stepY
          }
          if (dirs.includes(CONSTANTS.DIR.UP)) {
            my = stepY
          }
          if (dirs.includes(CONSTANTS.DIR.LEFT)) {
            mx = stepX
          }
          if (dirs.includes(CONSTANTS.DIR.RIGHT)) {
            mx = -stepX
          }
          this.translateXY(mx * translateRatio, my * translateRatio)
        }
      }
    })
    this.mindMap.on('resize', () => {
      if (!this.checkNeedMindMapInCanvas()) return
      this.transform()
    })
  }

  //  获取当前变换状态数据
  getTransformData() {
    return {
      transform: this.mindMap.draw.transform(),
      state: {
        scale: this.scale,
        x: this.x,
        y: this.y,
        sx: this.sx,
        sy: this.sy
      }
    }
  }

  //  动态设置变换状态数据
  setTransformData(viewData) {
    if (viewData) {
      Object.keys(viewData.state).forEach(prop => {
        this[prop] = viewData.state[prop]
      })
      this.mindMap.draw.transform({
        ...viewData.transform
      })
      this.mindMap.emit('view_data_change', this.getTransformData())
      this.emitEvent('scale')
      this.emitEvent('translate')
    }
  }

  //  平移x,y方向
  translateXY(x, y) {
    if (x === 0 && y === 0) return
    this.x += x
    this.y += y
    this.transform()
    this.emitEvent('translate')
  }

  //  触控板滚动的平滑惯性位移
  _smoothWheelTranslate(dx, dy) {
    // 空输入直接返回
    if (!dx && !dy) return
    // 累加速度，设置一个上限避免过快
    const MAX_SPEED = 40
    // 在速度累加前按锁定轴丢弃另一轴输入，避免注入横向速度
    if (this._wheelAxis === 'y') {
      dx = 0
    } else if (this._wheelAxis === 'x') {
      dy = 0
    }
    this._wheelVX = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this._wheelVX + dx))
    this._wheelVY = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this._wheelVY + dy))
    if (this._wheelAnimating) return
    this._wheelAnimating = true
    const DAMPING = 0.88 // 阻尼系数，值越小说明阻尼越大
    const MIN_SPEED = 0.1 // 低于该速度则停止
    const step = () => {
      // 逐帧执行轴锁定：锁定Y则禁止X速度，锁定X则禁止Y速度
      if (this._wheelAxis === 'y') {
        this._wheelVX = 0
      } else if (this._wheelAxis === 'x') {
        this._wheelVY = 0
      }
      this.translateXY(this._wheelVX, this._wheelVY)
      this._wheelVX *= DAMPING
      this._wheelVY *= DAMPING
      if (
        Math.abs(this._wheelVX) < MIN_SPEED &&
        Math.abs(this._wheelVY) < MIN_SPEED
      ) {
        this._wheelVX = 0
        this._wheelVY = 0
        this._wheelAnimating = false
        this._wheelRAF = 0
        return
      }
      this._wheelRAF = requestAnimationFrame(step)
    }
    this._wheelRAF = requestAnimationFrame(step)
  }

  //  平移x方向
  translateX(step) {
    if (step === 0) return
    this.x += step
    this.transform()
    this.emitEvent('translate')
  }

  //  平移x方式到
  translateXTo(x) {
    this.x = x
    this.transform()
    this.emitEvent('translate')
  }

  //  平移y方向
  translateY(step) {
    if (step === 0) return
    this.y += step
    this.transform()
    this.emitEvent('translate')
  }

  //  平移y方向到
  translateYTo(y) {
    this.y = y
    this.transform()
    this.emitEvent('translate')
  }

  //   应用变换
  transform() {
    try {
      this.limitMindMapInCanvas()
    } catch (error) {}
    this.mindMap.draw.transform({
      origin: [0, 0],
      scale: this.scale,
      translate: [this.x, this.y]
    })
    this.mindMap.emit('view_data_change', this.getTransformData())
  }

  //  恢复
  reset() {
    const scaleChange = this.scale !== 1
    const translateChange = this.x !== 0 || this.y !== 0
    this.scale = 1
    this.x = 0
    this.y = 0
    this.transform()
    if (scaleChange) {
      this.emitEvent('scale')
    }
    if (translateChange) {
      this.emitEvent('translate')
    }
  }

  //  缩小
  narrow(cx, cy, isTouchPad) {
    let { scaleRatio, minZoomRatio } = this.mindMap.opt
    scaleRatio = scaleRatio / (isTouchPad ? 5 : 1)
    const scale = Math.max(this.scale - scaleRatio, minZoomRatio / 100)
    this.scaleInCenter(scale, cx, cy)
    this.transform()
    this.emitEvent('scale')
  }

  //  放大
  enlarge(cx, cy, isTouchPad) {
    let { scaleRatio, maxZoomRatio } = this.mindMap.opt
    scaleRatio = scaleRatio / (isTouchPad ? 5 : 1)
    let scale = 0
    if (maxZoomRatio === -1) {
      scale = this.scale + scaleRatio
    } else {
      scale = Math.min(this.scale + scaleRatio, maxZoomRatio / 100)
    }
    this.scaleInCenter(scale, cx, cy)
    this.transform()
    this.emitEvent('scale')
  }

  // 基于指定中心进行缩放，cx，cy 可不指定，此时会使用画布中心点
  scaleInCenter(scale, cx, cy) {
    if (cx === undefined || cy === undefined) {
      cx = this.mindMap.width / 2
      cy = this.mindMap.height / 2
    }
    const prevScale = this.scale
    const ratio = 1 - scale / prevScale
    const dx = (cx - this.x) * ratio
    const dy = (cy - this.y) * ratio
    this.x += dx
    this.y += dy
    this.scale = scale
  }

  //  设置缩放
  setScale(scale, cx, cy) {
    if (cx !== undefined && cy !== undefined) {
      this.scaleInCenter(scale, cx, cy)
    } else {
      this.scale = scale
    }
    this.transform()
    this.emitEvent('scale')
  }

  // 适应画布大小
  fit(getRbox = () => {}, enlarge = false, fitPadding) {
    fitPadding =
      fitPadding === undefined ? this.mindMap.opt.fitPadding : fitPadding
    const draw = this.mindMap.draw
    const origTransform = draw.transform()
    const rect = getRbox() || draw.rbox()
    const drawWidth = rect.width / origTransform.scaleX
    const drawHeight = rect.height / origTransform.scaleY
    const drawRatio = drawWidth / drawHeight
    let { width: elWidth, height: elHeight } = this.mindMap.elRect
    elWidth = elWidth - fitPadding * 2
    elHeight = elHeight - fitPadding * 2
    const elRatio = elWidth / elHeight
    let newScale = 0
    let flag = ''
    if (drawWidth <= elWidth && drawHeight <= elHeight && !enlarge) {
      newScale = 1
      flag = 1
    } else {
      let newWidth = 0
      let newHeight = 0
      if (drawRatio > elRatio) {
        newWidth = elWidth
        newHeight = elWidth / drawRatio
        flag = 2
      } else {
        newHeight = elHeight
        newWidth = elHeight * drawRatio
        flag = 3
      }
      newScale = newWidth / drawWidth
    }
    this.setScale(newScale)
    const newRect = getRbox() || draw.rbox()
    // 需要考虑画布容器距浏览器窗口左上角的距离
    newRect.x -= this.mindMap.elRect.left
    newRect.y -= this.mindMap.elRect.top
    let newX = 0
    let newY = 0
    if (flag === 1) {
      newX = -newRect.x + fitPadding + (elWidth - newRect.width) / 2
      newY = -newRect.y + fitPadding + (elHeight - newRect.height) / 2
    } else if (flag === 2) {
      newX = -newRect.x + fitPadding
      newY = -newRect.y + fitPadding + (elHeight - newRect.height) / 2
    } else if (flag === 3) {
      newX = -newRect.x + fitPadding + (elWidth - newRect.width) / 2
      newY = -newRect.y + fitPadding
    }
    this.translateXY(newX, newY)
  }

  // 判断是否需要将思维导图限制在画布内
  checkNeedMindMapInCanvas() {
    // 如果当前在演示模式，那么不需要限制
    if (this.mindMap.demonstrate && this.mindMap.demonstrate.isInDemonstrate) {
      return false
    }
    const { isLimitMindMapInCanvasWhenHasScrollbar, isLimitMindMapInCanvas } =
      this.mindMap.opt
    // 如果注册了滚动条插件，那么使用isLimitMindMapInCanvasWhenHasScrollbar配置
    if (this.mindMap.scrollbar) {
      return isLimitMindMapInCanvasWhenHasScrollbar
    } else {
      // 否则使用isLimitMindMapInCanvas配置
      return isLimitMindMapInCanvas
    }
  }

  // 将思维导图限制在画布内
  limitMindMapInCanvas() {
    if (!this.checkNeedMindMapInCanvas()) return

    let { scale, left, top, right, bottom } = this.getPositionLimit()

    // 画布宽高改变了，但是思维导图元素变换的中心点依旧是原有位置，所以需要加上中心点变化量
    const centerXChange =
      ((this.mindMap.width - this.mindMap.initWidth) / 2) * scale
    const centerYChange =
      ((this.mindMap.height - this.mindMap.initHeight) / 2) * scale

    // 如果缩放值改变了
    const scaleRatio = this.scale / scale
    left *= scaleRatio
    right *= scaleRatio
    top *= scaleRatio
    bottom *= scaleRatio

    // 加上画布中心点距离
    const centerX = this.mindMap.width / 2
    const centerY = this.mindMap.height / 2
    const scaleOffset = this.scale - 1
    left -= scaleOffset * centerX - centerXChange
    right -= scaleOffset * centerX - centerXChange
    top -= scaleOffset * centerY - centerYChange
    bottom -= scaleOffset * centerY - centerYChange

    // 判断是否超出边界
    if (this.x > left) {
      this.x = left
    }
    if (this.x < right) {
      this.x = right
    }
    if (this.y > top) {
      this.y = top
    }
    if (this.y < bottom) {
      this.y = bottom
    }
  }

  // 计算图形四个方向的位置边界值
  getPositionLimit() {
    const { scaleX, scaleY } = this.mindMap.draw.transform()
    const drawRect = this.mindMap.draw.rbox()
    const rootRect = this.mindMap.renderer.root.group.rbox()
    const rootCenterOffset = this.mindMap.renderer.layout.getRootCenterOffset(
      rootRect.width,
      rootRect.height
    )
    const left = rootRect.x - drawRect.x - rootCenterOffset.x * scaleX
    const right = rootRect.x - drawRect.x2 - rootCenterOffset.x * scaleX
    const top = rootRect.y - drawRect.y - rootCenterOffset.y * scaleY
    const bottom = rootRect.y - drawRect.y2 - rootCenterOffset.y * scaleY
    return {
      scale: scaleX,
      left,
      right,
      top,
      bottom
    }
  }

  // 派发事件
  emitEvent(type) {
    switch (type) {
      case 'scale':
        this.mindMap.emit('scale', this.scale)
      case 'translate':
        this.mindMap.emit('translate', this.x, this.y)
    }
  }
}

export default View
