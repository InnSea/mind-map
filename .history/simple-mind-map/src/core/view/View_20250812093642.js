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
    
    // 触控板滚动优化相关变量
    this.touchpadScrollBuffer = { x: 0, y: 0 }
    this.lastScrollTime = 0
    this.scrollVelocity = { x: 0, y: 0 }
    this.isScrolling = false
    this.scrollTimeout = null
    this.scrollHistory = []
    
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
          // 智能触控板滚动算法
          const result = this.processTouchpadScroll(e.wheelDeltaX, e.wheelDeltaY)
          stepX = result.stepX
          stepY = result.stepY
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
    })
    this.mindMap.on('resize', () => {
      if (!this.checkNeedMindMapInCanvas()) return
      this.transform()
    })
  }

  // 智能触控板滚动处理
  processTouchpadScroll(deltaX, deltaY) {
    const currentTime = Date.now()
    const timeDelta = currentTime - this.lastScrollTime
    this.lastScrollTime = currentTime
    
    // 配置参数
    const config = {
      sensitivity: 0.4,           // 基础灵敏度
      threshold: 2,               // 最小触发阈值
      dampingFactor: 0.85,        // 阻尼系数
      maxVelocity: 50,            // 最大速度限制
      smoothingWindow: 3,         // 平滑窗口大小
      accelerationThreshold: 100, // 加速阈值
      decelerationRate: 0.95      // 减速率
    }
    
    // 记录滚动历史用于平滑处理
    this.scrollHistory.push({ deltaX, deltaY, time: currentTime })
    if (this.scrollHistory.length > config.smoothingWindow) {
      this.scrollHistory.shift()
    }
    
    // 计算平滑后的delta值
    const smoothDeltaX = this.scrollHistory.reduce((sum, item) => sum + item.deltaX, 0) / this.scrollHistory.length
    const smoothDeltaY = this.scrollHistory.reduce((sum, item) => sum + item.deltaY, 0) / this.scrollHistory.length
    
    // 计算当前速度
    if (timeDelta > 0 && timeDelta < 100) { // 只在合理时间间隔内计算速度
      this.scrollVelocity.x = (this.scrollVelocity.x * config.dampingFactor) + (smoothDeltaX / timeDelta * 10)
      this.scrollVelocity.y = (this.scrollVelocity.y * config.dampingFactor) + (smoothDeltaY / timeDelta * 10)
    }
    
    // 限制最大速度
    this.scrollVelocity.x = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, this.scrollVelocity.x))
    this.scrollVelocity.y = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, this.scrollVelocity.y))
    
    // 累积滚动缓冲区
    this.touchpadScrollBuffer.x += smoothDeltaX * config.sensitivity
    this.touchpadScrollBuffer.y += smoothDeltaY * config.sensitivity
    
    // 动态调整灵敏度（快速滚动时降低灵敏度）
    const velocityMagnitude = Math.sqrt(this.scrollVelocity.x ** 2 + this.scrollVelocity.y ** 2)
    const dynamicSensitivity = velocityMagnitude > config.accelerationThreshold 
      ? config.sensitivity * 0.6 
      : config.sensitivity
    
    // 计算实际移动步长
    let stepX = 0
    let stepY = 0
    
    // 只有当累积值超过阈值时才移动
    if (Math.abs(this.touchpadScrollBuffer.x) > config.threshold) {
      stepX = Math.abs(this.touchpadScrollBuffer.x) * dynamicSensitivity
      this.touchpadScrollBuffer.x = 0 // 重置缓冲区
    }
    
    if (Math.abs(this.touchpadScrollBuffer.y) > config.threshold) {
      stepY = Math.abs(this.touchpadScrollBuffer.y) * dynamicSensitivity
      this.touchpadScrollBuffer.y = 0 // 重置缓冲区
    }
    
    // 设置滚动状态和超时清理
    this.isScrolling = true
    clearTimeout(this.scrollTimeout)
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false
      this.scrollVelocity = { x: 0, y: 0 }
      this.touchpadScrollBuffer = { x: 0, y: 0 }
      this.scrollHistory = []
    }, 150)
    
    // 调试输出
    console.log('触控板滚动:', {
      原始: { deltaX, deltaY },
      平滑: { smoothDeltaX: smoothDeltaX.toFixed(2), smoothDeltaY: smoothDeltaY.toFixed(2) },
      速度: { vx: this.scrollVelocity.x.toFixed(2), vy: this.scrollVelocity.y.toFixed(2) },
      步长: { stepX: stepX.toFixed(2), stepY: stepY.toFixed(2) },
      缓冲: { bufX: this.touchpadScrollBuffer.x.toFixed(2), bufY: this.touchpadScrollBuffer.y.toFixed(2) }
    })
    
    return { stepX, stepY }
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