<template>
  <Sidebar ref="sidebar" :title="$t('nodeIconSidebar.title')">
    <div class="box" :class="{ isDark: isDark }">
      <el-tabs v-model="activeName">
        <el-tab-pane
          :label="$t('nodeIconSidebar.icon')"
          name="icon"
        ></el-tab-pane>
        <el-tab-pane
          :label="$t('nodeIconSidebar.sticker')"
          name="image"
        ></el-tab-pane>
      </el-tabs>
      <div class="boxContent">
        <!-- 图标 -->
        <div class="iconBox" v-if="activeName === 'icon'">
          <div class="item" v-for="item in nodeIconList" :key="item.name">
            <div class="title">{{ item.name }}</div>
            <div class="list">
              <div
                class="icon"
                v-for="icon in item.list"
                :key="icon.name"
                v-html="getHtml(icon.icon)"
                :class="{
                  selected: iconList.includes(item.type + '_' + icon.name)
                }"
                @click="setIcon(item.type, icon.name)"
              ></div>
            </div>
          </div>
        </div>
        <!-- 贴纸 -->
        <div class="imageBox" v-if="activeName === 'image'">
          <div class="item" v-for="item in nodeImageList" :key="item.name">
            <div class="title">{{ item.name }}</div>
            <div class="list">
              <div
                class="icon"
                v-for="image in item.list"
                :key="image.url"
                :class="{
                  selected: nodeImage === image.url
                }"
                @click="setImage(image)"
              >
                <img :src="image.url" alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Sidebar>
</template>

<script>
import Sidebar from './Sidebar.vue'
import { mapState } from 'vuex'
import { nodeIconList } from 'simple-mind-map/src/svg/icons'
import { mergerIconList } from 'simple-mind-map/src/utils/index'
import icon from '@/config/icon'
import image from '@/config/image'

// 根据用户名生成头像SVG（取最后两个字）
function generateAvatarSvg(name, color) {
  // 取最后两个字符
  const displayName = name.length >= 2 ? name.slice(-2) : name
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="grad_${name.replace(/\s/g, '_')}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
        <stop offset="100%" style="stop-color:${adjustColor(color, -30)};stop-opacity:1" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#grad_${name.replace(/\s/g, '_')})" stroke="#fff" stroke-width="2"/>
    <text x="50" y="50" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="central">${displayName}</text>
  </svg>`
}

// 调整颜色亮度
function adjustColor(color, amount) {
  const hex = color.replace('#', '')
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount))
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount))
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// 根据字符串生成稳定的颜色
function stringToColor(str) {
  const colors = [
    '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#E91E63',
    '#00BCD4', '#FF5722', '#3F51B5', '#8BC34A', '#FFC107',
    '#009688', '#673AB7', '#795548', '#607D8B', '#F44336'
  ]
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export default {
  components: {
    Sidebar
  },
  data() {
    return {
      activeName: 'icon',
      nodeIconList: mergerIconList([...nodeIconList, ...icon]),
      nodeImageList: [...image],
      iconList: [],
      nodeImage: '',
      activeNodes: [],
      userIconsLoaded: false
    }
  },
  computed: {
    ...mapState({
      activeSidebar: state => state.activeSidebar,
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    activeSidebar(val) {
      if (val === 'nodeIconSidebar') {
        this.$refs.sidebar.show = true
      } else {
        this.$refs.sidebar.show = false
      }
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
    this.$bus.$on('showNodeIcon', this.handleShowNodeIcon)
  },
  beforeDestroy() {
    this.$bus.$off('node_active', this.handleNodeActive)
    this.$bus.$off('showNodeIcon', this.handleShowNodeIcon)
  },
  methods: {
    handleNodeActive(...args) {
      this.activeNodes = [...args[1]]
      if (this.activeNodes.length > 0) {
        if (this.activeNodes.length === 1) {
          let firstNode = this.activeNodes[0]
          this.nodeImage = firstNode.getData('image') || ''
          this.iconList = firstNode.getData('icon') || [] // 回显图标
        } else {
          this.nodeImage = []
          this.iconList = []
        }
      } else {
        this.iconList = []
        this.nodeImage = ''
      }
    },

    handleShowNodeIcon() {
      this.dialogVisible = true
    },

    // 获取图标渲染方式
    getHtml(icon) {
      return /^<svg/.test(icon) ? icon : `<img src="${icon}" />`
    },

    // 设置icon
    setIcon(type, name) {
      this.activeNodes.forEach(node => {
        const iconList = [...(node.getData('icon') || [])]
        let key = type + '_' + name
        let index = iconList.findIndex(item => {
          return item === key
        })
        // 删除icon
        if (index !== -1) {
          iconList.splice(index, 1)
        } else {
          let typeIndex = iconList.findIndex(item => {
            return item.split('_')[0] === type
          })
          // 替换icon
          if (typeIndex !== -1) {
            iconList.splice(typeIndex, 1, key)
          } else {
            // 增加icon
            iconList.push(key)
          }
        }
        node.setIcon(iconList)
        if (this.activeNodes.length === 1) {
          this.iconList = iconList
        }
      })
    },

    // 设置贴纸
    setImage(image) {
      this.activeNodes.forEach(node => {
        this.nodeImage = image.url
        node.setImage({
          ...image
        })
      })
    }
  }
}
</script>

<style lang="less" scoped>
.box {
  padding: 0 20px;

  &.isDark {
    .title {
      color: #fff;
    }
  }

  .title {
    font-size: 16px;
    font-weight: 500;
    color: #333;
  }

  .boxContent {
    .iconBox {
      .item {
        margin-bottom: 20px;
        font-weight: bold;

        .title {
          margin-bottom: 10px;
        }

        .list {
          display: flex;
          flex-wrap: wrap;

          .icon {
            width: 24px;
            height: 24px;
            margin-right: 10px;
            margin-bottom: 10px;
            cursor: pointer;
            position: relative;

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
      }
    }

    .imageBox {
      margin-bottom: 20px;
      font-weight: bold;

      .title {
        margin-bottom: 10px;
      }

      .list {
        display: flex;
        flex-wrap: wrap;

        .icon {
          width: 50px;
          height: 50px;
          margin-right: 10px;
          margin-bottom: 10px;
          cursor: pointer;
          position: relative;

          /deep/ img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }

          &.selected {
            &::after {
              content: '';
              position: absolute;
              left: -4px;
              top: -4px;
              width: 54px;
              height: 54px;
              border: 2px solid #409eff;
            }
          }
        }
      }
    }
  }
}
</style>
