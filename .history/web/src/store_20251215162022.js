import Vue from 'vue'
import Vuex from 'vuex'
import { storeLocalConfig } from '@/api'

Vue.use(Vuex)

function adjustColor(color, amount) {
  const hex = color.replace('#', '')
  const r = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(0, 2), 16) + amount)
  )
  const g = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(2, 4), 16) + amount)
  )
  const b = Math.max(
    0,
    Math.min(255, parseInt(hex.substring(4, 6), 16) + amount)
  )
  return `#${r.toString(16).padStart(2, '0')}${g
    .toString(16)
    .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function generateAvatarSvg(name, color) {
  const displayName = name.length >= 2 ? name.slice(-2) : name
  const gradientId = `grad_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Math.random()
    .toString(36)
    .slice(2, 11)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${adjustColor(
            color,
            -30
          )};stop-opacity:1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#${gradientId})" stroke="#fff" stroke-width="2"/>
      <text x="50" y="50" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">${displayName}</text>
    </svg>`
}

function stringToColor(str) {
  const colors = [
    '#4CAF50',
    '#2196F3',
    '#9C27B0',
    '#FF9800',
    '#E91E63',
    '#00BCD4',
    '#FF5722',
    '#3F51B5',
    '#8BC34A',
    '#FFC107',
    '#009688',
    '#673AB7',
    '#795548',
    '#607D8B',
    '#F44336'
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const store = new Vuex.Store({
  state: {
    isHandleLocalFile: false, // 是否操作的是本地文件
    localConfig: {
      // 本地配置
      isZenMode: false, // 是否是禅模式
      // 是否开启节点富文本
      openNodeRichText: true,
      // 鼠标行为
      useLeftKeySelectionRightKeyDrag: false,
      // 是否显示滚动条
      isShowScrollbar: false,
      // 是否开启手绘风格
      isUseHandDrawnLikeStyle: false,
      // 是否开启动量效果
      isUseMomentum: true,
      // 是否是暗黑模式
      isDark: false,
      // 是否开启AI功能
      enableAi: true
    },
    activeSidebar: '', // 当前显示的侧边栏
    isOutlineEdit: false, // 是否是大纲编辑模式
    isReadonly: false, // 是否只读
    isSourceCodeEdit: false, // 是否是源码编辑模式
    extraTextOnExport: '', // 导出时底部添加的文字
    supportHandDrawnLikeStyle: false, // 是否支持设置手绘风格
    supportMark: false, // 是否支持标记
    supportNumbers: false, // 是否支持编号
    supportFreemind: false, // 是否支持Freemind插件
    supportExcel: false, // 是否支持Excel插件
    supportCheckbox: false, // 是否支持Checkbox插件
    supportLineFlow: false, // 是否支持LineFlow插件
    supportMomentum: false, // 是否支持Momentum插件
    supportRightFishbone: false, // 是否支持RightFishbone插件
    supportNodeLink: false, // 是否支持NodeLink插件
    supportMoreShapes: false, // 是否支持MoreShapes插件
    isDragOutlineTreeNode: false, // 当前是否正在拖拽大纲树的节点
    aiConfig: {
      api: 'http://ark.cn-beijing.volces.com/api/v3/chat/completions',
      key: '2f27c118-5cf7-4117-9ddc-206c47e11257',
      model: 'deepseek-v3-2-251201',
      port: 3456,
      method: 'POST'
    },
    // 扩展主题列表
    extendThemeGroupList: [],
    // 内置背景图片
    bgList: [],
    userIconList: []
  },
  mutations: {
    // 设置操作本地文件标志位
    setIsHandleLocalFile(state, data) {
      state.isHandleLocalFile = data
    },

    // 设置本地配置
    setLocalConfig(state, data) {
      const aiConfigKeys = Object.keys(state.aiConfig)
      Object.keys(data).forEach(key => {
        if (aiConfigKeys.includes(key)) {
          state.aiConfig[key] = data[key]
        } else {
          state.localConfig[key] = data[key]
        }
      })
      storeLocalConfig({
        ...state.localConfig,
        ...state.aiConfig
      })
    },

    // 设置当前显示的侧边栏
    setActiveSidebar(state, data) {
      state.activeSidebar = data
    },

    // 设置大纲编辑模式
    setIsOutlineEdit(state, data) {
      state.isOutlineEdit = data
    },

    // 设置是否只读
    setIsReadonly(state, data) {
      state.isReadonly = data
    },

    // 设置源码编辑模式
    setIsSourceCodeEdit(state, data) {
      state.isSourceCodeEdit = data
    },

    // 设置导出时底部添加的文字
    setExtraTextOnExport(state, data) {
      state.extraTextOnExport = data
    },

    // 设置是否支持手绘风格
    setSupportHandDrawnLikeStyle(state, data) {
      state.supportHandDrawnLikeStyle = data
    },

    // 设置是否支持标记
    setSupportMark(state, data) {
      state.supportMark = data
    },

    // 设置是否支持编号
    setSupportNumbers(state, data) {
      state.supportNumbers = data
    },

    // 设置是否支持Freemind插件
    setSupportFreemind(state, data) {
      state.supportFreemind = data
    },

    // 设置是否支持Excel插件
    setSupportExcel(state, data) {
      state.supportExcel = data
    },

    // 设置是否支持Checkbox插件
    setSupportCheckbox(state, data) {
      state.supportCheckbox = data
    },

    // 设置是否支持Lineflow插件
    setSupportLineFlow(state, data) {
      state.supportLineFlow = data
    },

    // 设置是否支持Momentum插件
    setSupportMomentum(state, data) {
      state.supportMomentum = data
    },

    // 设置是否支持RightFishbone插件
    setSupportRightFishbone(state, data) {
      state.supportRightFishbone = data
    },

    // 设置是否支持NodeLink插件
    setSupportNodeLink(state, data) {
      state.supportNodeLink = data
    },

    // 设置是否支持MoreShapes插件
    setSupportMoreShapes(state, data) {
      state.supportMoreShapes = data
    },

    // 设置树节点拖拽
    setIsDragOutlineTreeNode(state, data) {
      state.isDragOutlineTreeNode = data
    },

    // 扩展主题列表
    setExtendThemeGroupList(state, data) {
      state.extendThemeGroupList = data
    },

    // 设置背景图片列表
    setBgList(state, data) {
      state.bgList = data
    },

    // 设置用户图标列表
    setUserIconList(state, data) {
      state.userIconList = data
    }
  },
  actions: {
    async loadUserIconList({ commit, state }) {
      if (state.userIconList.length > 0) {
        return state.userIconList
      }
      try {
        const response = await fetch(
          'https://test.classtorch.com/api/auth/user/list?page=1&size=1000'
        )
        const result = await response.json()
        if (result.code === 0 && Array.isArray(result.data)) {
          const iconList = result.data
            .filter(user => user.name && user.is_del === 0)
            .map(user => generateAvatarSvg(user.name, stringToColor(user.name)))
          commit('setUserIconList', iconList)
          return iconList
        }
        return []
      } catch (error) {
        console.error('加载用户头像失败:', error)
        return []
      }
    }
  }
})

export default store
