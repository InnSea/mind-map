import { annotate } from 'rough-notation'
import { formatDataToArray, isUndef } from './utils'

// 标记注释插件
class Notation {
  constructor({ mindMap }) {
    this.mindMap = mindMap
    this.defaultConfig = {
      type: 'circle',
      color: this.mindMap.opt.hoverRectColor,
      strokeWidth: 1,
      padding: 20,
      animate: true
    }
    this.cacheHandleBeingExportSvg = null
    this.cacheHandleDragCloneNode = null
    this.bindEvent()
  }

  bindEvent() {
    this.renderNodeNotation = this.renderNodeNotation.bind(this)
    this.mindMap.on('node_layout_end', this.renderNodeNotation)

    this.setNotation = this.setNotation.bind(this)
    this.mindMap.command.add('SET_NOTATION', this.setNotation)

    this.handleBeingExportSvg = this.handleBeingExportSvg.bind(this)
    this.cacheHandleBeingExportSvg = this.mindMap.opt.handleBeingExportSvg
    this.mindMap.opt.handleBeingExportSvg = this.handleBeingExportSvg

    this.handleDragCloneNode = this.handleDragCloneNode.bind(this)
    this.cacheHandleDragCloneNode = this.mindMap.opt.handleDragCloneNode
    this.mindMap.opt.handleDragCloneNode = this.handleDragCloneNode
  }

  unBindEvent() {
    this.mindMap.off('node_layout_end', this.renderNodeNotation)
    this.mindMap.command.remove('SET_NOTATION', this.setNotation)
    this.mindMap.opt.handleBeingExportSvg = this.cacheHandleBeingExportSvg
    this.mindMap.opt.handleDragCloneNode = this.cacheHandleDragCloneNode
  }

  // 给指定节点渲染标记
  renderNodeNotation(node) {
    setTimeout(() => {
      const notationData = node.getData('notation')
      if (notationData) {
        const { show, config } = notationData
        if (show) {
          if (node.notationObj) {
            node.notationObj.remove()
          }
          const _config = {
            ...this.defaultConfig
          }
          Object.keys(this.defaultConfig).forEach(key => {
            if (!isUndef(config[key])) {
              _config[key] = config[key]
            }
          })
          node.notationObj = annotate(
            node.group.findOne('.smm-node-shape').node,
            _config
          )
          node.notationObj.haveRectsChanged = () => {
            return false
          }
          node.notationObj._resizeListener = () => {}
          node.notationObj.show()
          // 方向缩放标记，否则大小不对
          const { scaleX } = this.mindMap.draw.transform()
          Array.from(node.notationObj._svg.children).forEach(child => {
            child.style.transform = `scale(${1 / scaleX})`
          })
        } else if (node.notationObj) {
          node.notationObj.remove()
        }
      }
    }, 0)
  }

  // 给节点设置标记数据
  setNotation(appointNodes, show, config) {
    appointNodes = formatDataToArray(appointNodes)
    const activeNodeList = this.mindMap.renderer.activeNodeList
    if (activeNodeList.length <= 0 && appointNodes.length <= 0) {
      return
    }
    const isAppointNodes = appointNodes.length > 0
    const list = isAppointNodes ? appointNodes : activeNodeList
    list.forEach(node => {
      this.mindMap.execCommand('SET_NODE_DATA', node, {
        notation: {
          show,
          config: {
            ...(config || {})
          }
        }
      })
      node.needLayout = true
    })
    this.mindMap.render(null)
  }

  // 导出的时候去除动画属性
  handleBeingExportSvg(svg) {
    const list = svg.find('.rough-annotation')
    list.forEach(item => {
      const children = item.children()
      if (children && children.length > 0) {
        children.forEach(child => {
          child.css('stroke-dashoffset', '')
          child.css('stroke-dasharray', '')
          child.css('animation', '')
        })
      }
    })
    return svg
  }

  // 节点拖拽时移除标记元素
  handleDragCloneNode(node) {
    const list = node.find('.rough-annotation')
    list.forEach(item => {
      item.remove()
    })
  }

  // 插件被移除前做的事情
  beforePluginRemove() {
    this.unBindEvent()
  }

  // 插件被卸载前做的事情
  beforePluginDestroy() {
    this.unBindEvent()
  }
}

Notation.instanceName = 'notation'

export default Notation
