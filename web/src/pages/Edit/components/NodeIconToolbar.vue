<template>
  <div
    class="nodeIconToolbar"
    :class="{ executionIconToolbar: iconType === caseExecutionIconType }"
    ref="nodeIconToolbar"
    :style="style"
    @click.stop.passive
    v-show="showNodeIconToolbar"
  >
    <div class="iconListBox">
      <div
        class="icon"
        v-for="icon in iconList"
        :key="icon.name"
        v-html="getHtml(icon.icon)"
        :class="{
          selected: isIconSelected(icon.name)
        }"
        :title="icon.title || icon.name"
        @click="setIcon(icon.name)"
      ></div>
    </div>
    <div class="btnBox">
      <span
        v-for="opt in userStatusOptions"
        :key="opt.type"
        v-show="iconType === 'user'"
        class="statusBtn"
        :class="{ active: activeUserStatus === opt.type }"
        :style="{ background: opt.resultColor }"
        @click="setUserStatus(opt.type)"
      >{{ opt.shortLabel }}</span>
      <span class="btn iconfont iconshanchu" @click="deleteIcon"></span>
    </div>
  </div>
</template>

<script>
import { nodeIconList as _nodeIconList } from 'simple-mind-map/src/svg/icons'
import icon, {
  CASE_EXECUTION_ICON_TYPE,
  findSameExecutionEnvironmentIconIndex
} from '@/config/icon'
import { userStatusOptions, generateStatusOverlaySvg } from '@/config/userStatusOverlay'
import { mapState, mapMutations } from 'vuex'

export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      showNodeIconToolbar: false,
      caseExecutionIconType: CASE_EXECUTION_ICON_TYPE,
      userStatusOptions,
      activeUserStatus: '',
      style: {
        left: 0,
        top: 0
      },
      node: null,
      iconType: '',
      iconName: '',
      nodeIconList: [],
      iconList: []
    }
  },
  computed: {
    ...mapState(['activeSidebar', 'dynamicIconList']),
    allIconList() {
      return [..._nodeIconList, ...this.dynamicIconList, ...icon]
    }
  },
  created() {
    this.mindMap.on('node_icon_click', this.show)
    this.mindMap.on('draw_click', this.close)
    this.mindMap.on('svg_mousedown', this.close)
    this.mindMap.on('node_dblclick', this.close)
    this.mindMap.on('node_active', this.onNodeActive)
    this.mindMap.on('scale', this.onScale)
    this.$bus.$on('close_node_icon_toolbar', this.close)
  },
  mounted() {
    document.body.append(this.$refs.nodeIconToolbar)
  },
  beforeDestroy() {
    this.mindMap.off('node_icon_click', this.show)
    this.mindMap.off('draw_click', this.close)
    this.mindMap.off('svg_mousedown', this.close)
    this.mindMap.off('node_dblclick', this.close)
    this.mindMap.off('node_active', this.onNodeActive)
    this.mindMap.off('scale', this.onScale)
    this.$bus.$off('close_node_icon_toolbar', this.close)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    show(node, icon) {
      this.node = node
      const rawType = icon.split('_')[0]
      const rawName = icon.split('_')[1]
      this.nodeIconList = node.getData('icon') || []

      // 点击的是用户状态图标 → 按用户图标处理，保留状态上下文
      if (rawType === 'userStatus') {
        // key 格式: userStatus_<uid>-<statusType>
        const dashIdx = rawName.lastIndexOf('-')
        this.iconType = 'user'
        this.iconName = rawName.slice(0, dashIdx)
        this.activeUserStatus = rawName.slice(dashIdx + 1)
      } else {
        // userGroup1 / userGroup2 等分组类型统一归一化为 user
        this.iconType = rawType.startsWith('userGroup') ? 'user' : rawType
        this.iconName = rawName
        if (this.iconType === 'user') {
          const existingStatus = this.nodeIconList.find(item => item.startsWith(`userStatus_${this.iconName}-`))
          if (existingStatus) {
            const namePart = existingStatus.split('_')[1]
            this.activeUserStatus = namePart.split('-').pop()
          } else {
            this.activeUserStatus = ''
          }
        } else {
          this.activeUserStatus = ''
        }
      }
      const typeData = this.allIconList.find(item => {
        return item.type === this.iconType
      })
      this.iconList = typeData ? [...typeData.list] : []
      // 用户图标：根据选中的用户，只展示其所在分组的其他用户图标
      if (this.iconType === 'user') {
        const userGroup = this.allIconList.find(item =>
          item.type.startsWith('userGroup') &&
          item.list.some(u => u.name === this.iconName)
        )
        if (userGroup) {
          const groupUids = new Set(userGroup.list.map(u => u.name))
          this.iconList = this.iconList.filter(item => groupUids.has(item.name))
        }
      }
      if (this.iconType === CASE_EXECUTION_ICON_TYPE) {
        const environment = this.iconName.startsWith('pd') ? 'pd' : 'rd'
        this.iconList = this.iconList.filter(item => item.name.startsWith(environment))
      }
      this.updatePos()
      this.showNodeIconToolbar = true
      if (this.activeSidebar === 'nodeIconSidebar') {
        this.setActiveSidebar(null)
      }
    },

    close() {
      this.showNodeIconToolbar = false
      this.node = null
      this.iconType = ''
      this.iconName = ''
      this.nodeIconList = []
      this.iconList = []
      this.activeUserStatus = ''
      this.style.left = 0
      this.style.top = 0
    },

    updatePos() {
      if (!this.node) return
      const rect = this.node.getRect()
      this.style.left = rect.x + 'px'
      this.style.top = rect.y + rect.height + 'px'
    },

    onScale() {
      this.updatePos()
    },

    onNodeActive(node) {
      if (node === this.node) {
        return
      }
      this.close()
    },

    // 设置用户执行状态（半圆覆盖层替换头像）
    setUserStatus(statusType) {
      const uid = this.iconName

      // 点击已激活的状态 → 取消覆盖，恢复普通头像
      if (this.activeUserStatus === statusType) {
        const idx = this.nodeIconList.findIndex(item => this.isIconForUser(item, uid))
        if (idx !== -1) {
          this.nodeIconList.splice(idx, 1, `user_${uid}`)
        }
        this.node.setIcon([...this.nodeIconList])
        this.activeUserStatus = ''
        this.close()
        return
      }

      // 查找头像 SVG 用于生成覆盖层
      const userIconItem = this.iconList.find(item => item.name === uid)
      if (!userIconItem) return

      const opt = this.userStatusOptions.find(s => s.type === statusType)
      if (!opt) return
      const overlaySvg = generateStatusOverlaySvg(userIconItem.icon, opt.env, opt.resultColor)

      // 注册到 mindMap.opt.iconList
      let userStatusGroup = this.mindMap.opt.iconList.find(item => item.type === 'userStatus')
      if (!userStatusGroup) {
        userStatusGroup = { name: '用户执行状态', type: 'userStatus', list: [] }
        this.mindMap.opt.iconList.push(userStatusGroup)
      }
      const entryName = `${uid}-${statusType}`
      const existIdx = userStatusGroup.list.findIndex(item => item.name === entryName)
      if (existIdx !== -1) {
        userStatusGroup.list[existIdx].icon = overlaySvg
      } else {
        userStatusGroup.list.push({ name: entryName, icon: overlaySvg })
      }

      // 在原位置替换，保持图标顺序不变
      const idx = this.nodeIconList.findIndex(item => this.isIconForUser(item, uid))
      if (idx !== -1) {
        this.nodeIconList.splice(idx, 1, `userStatus_${uid}-${statusType}`)
      } else {
        this.nodeIconList.push(`userStatus_${uid}-${statusType}`)
      }
      this.node.setIcon([...this.nodeIconList])
      this.activeUserStatus = statusType
      this.close()
    },

    deleteIcon() {
      if (this.activeUserStatus) {
        this.nodeIconList = this.nodeIconList.filter(item => !this.isIconForUser(item, this.iconName))
        this.activeUserStatus = ''
        this.node.setIcon([...this.nodeIconList])
        this.close()
        return
      }
      this.setIcon(this.iconName)
      this.close()
    },

    // 判断图标是否已选中（用户类型需同时检查状态覆盖层和 userGroup* 前缀）
    isIconSelected(name) {
      if (this.iconType === 'user') {
        // 节点可能以 user_ 或 userGroup*_ 前缀存储用户图标
        if (this.nodeIconList.some(key => key.startsWith('user') && key.split('_').pop() === name && !key.startsWith('userStatus'))) return true
        if (this.activeUserStatus) {
          return this.nodeIconList.includes(`userStatus_${name}-${this.activeUserStatus}`)
        }
        return false
      }
      return this.nodeIconList.includes(this.iconType + '_' + name)
    },

    // 获取图标渲染方式
    getHtml(icon) {
      return /^<svg/.test(icon) ? icon : `<img src="${icon}" />`
    },

    // 判断 key 是否为用户头像图标（user_ 或 userGroup*_ 前缀）
    isUserIconKey(key) {
      return key.startsWith('user') && !key.startsWith('userStatus')
    },

    // 判断图标 key 是否属于指定 uid（多用户节点时只操作当前用户）
    isIconForUser(key, uid) {
      if (key.startsWith('userStatus_')) {
        return key.split('_')[1].startsWith(uid + '-')
      }
      if (this.isUserIconKey(key)) {
        return key.split('_').pop() === uid
      }
      return false
    },

    // 设置icon
    setIcon(name) {
      if (this.iconType === 'user') {
        const isCurrentUser = this.nodeIconList.some(key => this.isUserIconKey(key) && key.split('_').pop() === name)
        if (isCurrentUser) {
          this.nodeIconList = this.nodeIconList.filter(item => !this.isIconForUser(item, name))
          this.activeUserStatus = ''
          this.node.setIcon([...this.nodeIconList])
          return
        }
        // 切换头像 → 只替换旧头像，保留同节点其他用户
        const oldUid = this.iconName
        const savedStatus = this.activeUserStatus
        this.iconName = name
        if (savedStatus) {
          const userIconItem = this.iconList.find(item => item.name === name)
          if (!userIconItem) return
          const opt = this.userStatusOptions.find(s => s.type === savedStatus)
          if (!opt) return
          const overlaySvg = generateStatusOverlaySvg(userIconItem.icon, opt.env, opt.resultColor)
          const userStatusGroup = this.mindMap.opt.iconList.find(item => item.type === 'userStatus')
          if (userStatusGroup) {
            const entryName = `${name}-${savedStatus}`
            const existIdx = userStatusGroup.list.findIndex(item => item.name === entryName)
            if (existIdx !== -1) {
              userStatusGroup.list[existIdx].icon = overlaySvg
            } else {
              userStatusGroup.list.push({ name: entryName, icon: overlaySvg })
            }
          }
          const replaceIdx = this.nodeIconList.findIndex(item => this.isIconForUser(item, oldUid))
          if (replaceIdx !== -1) {
            this.nodeIconList.splice(replaceIdx, 1, `userStatus_${name}-${savedStatus}`)
          } else {
            this.nodeIconList.push(`userStatus_${name}-${savedStatus}`)
          }
        } else {
          const replaceIdx = this.nodeIconList.findIndex(item => this.isIconForUser(item, oldUid))
          if (replaceIdx !== -1) {
            this.nodeIconList.splice(replaceIdx, 1, `user_${name}`)
          } else {
            this.nodeIconList.push(`user_${name}`)
          }
        }
        this.node.setIcon([...this.nodeIconList])
        return
      }
      let key = this.iconType + '_' + name
      let index = this.nodeIconList.findIndex(item => {
        return item === key
      })
      // 删除icon
      if (index !== -1) {
        this.nodeIconList.splice(index, 1)
      } else {
        const isBuiltInType = _nodeIconList.some(item => item.type === this.iconType)
        let targetIndex
        const executionIndex = findSameExecutionEnvironmentIconIndex(this.nodeIconList, this.iconType, name)
        if (this.iconType === CASE_EXECUTION_ICON_TYPE) {
          targetIndex = executionIndex
        } else if (isBuiltInType) {
          targetIndex = this.nodeIconList.findIndex(item => item.split('_')[0] === this.iconType)
        } else {
          targetIndex = this.nodeIconList.findIndex(item => item === this.iconType + '_' + this.iconName)
        }
        if (targetIndex !== -1) {
          this.nodeIconList.splice(targetIndex, 1, key)
          this.iconName = name
        } else {
          this.nodeIconList.push(key)
        }
      }
      this.node.setIcon([...this.nodeIconList])
    }
  }
}
</script>

<style lang="less" scoped>
.nodeIconToolbar {
  position: fixed;
  z-index: 2000;
  width: 210px;
  max-height: 170px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .iconListBox {
    width: 100%;
    height: 180px;
    overflow-y: auto;
    padding: 10px;

    .icon {
      width: 24px;
      height: 24px;
      margin: 5px;
      cursor: pointer;
      position: relative;
      float: left;

      /deep/ img {
        width: 100%;
        height: 100%;
      }

      /deep/ svg {
        width: 100%;
        height: 100%;
      }

      &.selected {
        &::after {
          content: '';
          position: absolute;
          left: -4px;
          top: -4px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 2px solid #409eff;
        }
      }
    }
  }

  &.executionIconToolbar {
    .iconListBox .icon {
      width: 45px;
      height: 26px;

      &.selected::after {
        left: -4px;
        top: -4px;
        width: 49px;
        height: 30px;
        border-radius: 6px;
      }
    }
  }

  .btnBox {
    width: 100%;
    height: 30px;
    display: flex;
    justify-content: center;
    align-items: center;
    border-top: 1px solid #eee;
    flex-shrink: 0;
    gap: 6px;
    padding: 0 6px;

    .btn {
      cursor: pointer;
      color: rgba(26, 26, 26, 0.8);

      &:hover {
        color: #f56c6c;
      }
    }

    .statusBtn {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      color: #fff;
      cursor: pointer;
      white-space: nowrap;
      opacity: 0.7;
      transition: opacity 0.15s;

      &:hover {
        opacity: 0.9;
      }

      &.active {
        opacity: 1;
        box-shadow: 0 0 0 2px #fff, 0 0 0 4px currentColor;
      }
    }
  }
}
</style>
