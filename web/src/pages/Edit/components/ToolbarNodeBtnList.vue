<template>
  <div class="toolbarNodeBtnList" :class="[dir, { isDark: isDark }]">
    <template v-for="item in list">
      <div
        v-if="item === 'back'"
        class="toolbarBtn"
        :class="{
          disabled: readonly || backEnd
        }"
        @click="$bus.$emit('execCommand', 'BACK')"
      >
        <span class="icon iconfont iconhoutui-shi"></span>
        <span class="text">{{ $t('toolbar.undo') }}</span>
      </div>
      <div
        v-if="item === 'forward'"
        class="toolbarBtn"
        :class="{
          disabled: readonly || forwardEnd
        }"
        @click="$bus.$emit('execCommand', 'FORWARD')"
      >
        <span class="icon iconfont iconqianjin1"></span>
        <span class="text">{{ $t('toolbar.redo') }}</span>
      </div>
      <div
        v-if="item === 'painter'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization,
          active: isInPainter
        }"
        @click="$bus.$emit('startPainter')"
      >
        <span class="icon iconfont iconjiedian"></span>
        <span class="text">{{ $t('toolbar.painter') }}</span>
      </div>
      <div
        v-if="item === 'siblingNode'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasRoot || hasGeneralization
        }"
        @click="$bus.$emit('execCommand', 'INSERT_NODE')"
      >
        <span class="icon iconfont iconjiedian"></span>
        <span class="text">{{ $t('toolbar.insertSiblingNode') }}</span>
      </div>
      <div
        v-if="item === 'childNode'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization
        }"
        @click="$bus.$emit('execCommand', 'INSERT_CHILD_NODE')"
      >
        <span class="icon iconfont icontianjiazijiedian"></span>
        <span class="text">{{ $t('toolbar.insertChildNode') }}</span>
      </div>
      <div
        v-if="item === 'deleteNode'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('execCommand', 'REMOVE_NODE')"
      >
        <span class="icon iconfont iconshanchu"></span>
        <span class="text">{{ $t('toolbar.deleteNode') }}</span>
      </div>
      <div
        v-if="item === 'image'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('showNodeImage')"
      >
        <span class="icon iconfont iconimage"></span>
        <span class="text">{{ $t('toolbar.image') }}</span>
      </div>
      <div
        v-if="item === 'video'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('showNodeVideo')"
      >
        <span class="icon iconfont iconfujian"></span>
        <span class="text">{{ $t('toolbar.video') }}</span>
      </div>
      <div
        v-if="item === 'icon'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="showNodeIcon"
      >
        <span class="icon iconfont iconxiaolian"></span>
        <span class="text">{{ $t('toolbar.icon') }}</span>
      </div>
      <div
        v-if="item === 'link'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('showNodeLink')"
      >
        <span class="icon iconfont iconchaolianjie"></span>
        <span class="text">{{ $t('toolbar.link') }}</span>
      </div>
      <div
        v-if="item === 'note'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('showNodeNote')"
      >
        <span class="icon iconfont iconflow-Mark"></span>
        <span class="text">{{ $t('toolbar.note') }}</span>
      </div>
      <div
        v-if="item === 'tag'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0
        }"
        @click="$bus.$emit('showNodeTag')"
      >
        <span class="icon iconfont iconbiaoqian"></span>
        <span class="text">{{ $t('toolbar.tag') }}</span>
      </div>
      <el-popover
        v-if="item === 'quickTag'"
        v-model="quickTagPopoverShow"
        placement="bottom"
        trigger="click"
        :disabled="activeNodes.length <= 0"
        popper-class="quickTagPopover"
      >
        <div class="quickTagList">
          <div
            v-for="group in quickTagGroups"
            :key="group.title"
            class="quickTagGroup"
          >
            <div class="quickTagGroupTitle">{{ group.title }}</div>
            <div
              class="quickTagGroupItems"
              :class="`columns-${group.columns}`"
            >
              <div
                v-for="tag in group.tags"
                :key="tag"
                class="quickTagItem"
                :class="{ active: isTagActive(tag) }"
                :style="{ backgroundColor: getTagColor(tag) }"
                @click="toggleQuickTag(tag)"
              >
                <span class="quickTagText">{{ tag }}</span>
                <span
                  v-if="isTagActive(tag)"
                  class="iconfont iconchenggou checkIcon"
                ></span>
              </div>
            </div>
          </div>
          <div v-if="customQuickTags.length" class="quickTagGroup">
            <div class="quickTagGroupTitle">{{ $t('quickTag.custom') }}</div>
            <div class="quickTagGroupItems columns-2">
              <div
                v-for="tag in customQuickTags"
                :key="tag"
                class="quickTagItem customQuickTagItem"
                :class="{ active: isTagActive(tag) }"
                :style="{ backgroundColor: getTagColor(tag) }"
                @click="toggleQuickTag(tag)"
              >
                <span class="quickTagText" :title="tag">{{ tag }}</span>
                <span
                  v-if="isTagActive(tag)"
                  class="iconfont iconchenggou checkIcon"
                ></span>
                <button
                  type="button"
                  class="quickTagDeleteButton"
                  :disabled="quickTagLoading || quickTagSaving"
                  :title="$t('quickTag.delete')"
                  @click.stop="removeCustomQuickTag(tag)"
                >
                  <span class="iconfont iconshanchu"></span>
                </button>
              </div>
            </div>
          </div>
          <div class="quickTagAddArea">
            <button
              v-if="!quickTagAdding"
              type="button"
              class="quickTagAddButton"
              :disabled="quickTagLoading || quickTagSaving"
              @click.stop="startAddQuickTag"
            >
              <span class="el-icon-plus"></span>
              <span>{{ $t('quickTag.add') }}</span>
            </button>
            <div v-else class="quickTagAddForm">
              <el-input
                ref="quickTagInput"
                v-model="newQuickTag"
                size="mini"
                :maxlength="maxQuickTagLength"
                :placeholder="$t('quickTag.placeholder')"
                @keyup.native.enter.stop="addCustomQuickTag"
                @keyup.native.esc.stop="cancelAddQuickTag"
                @keydown.native.stop
              ></el-input>
              <el-button
                size="mini"
                type="primary"
                :loading="quickTagSaving"
                :disabled="!newQuickTag.trim()"
                @click.stop="addCustomQuickTag"
              >
                {{ $t('quickTag.confirmAdd') }}
              </el-button>
              <el-button
                size="mini"
                :disabled="quickTagSaving"
                @click.stop="cancelAddQuickTag"
              >
                {{ $t('dialog.cancel') }}
              </el-button>
            </div>
          </div>
        </div>
        <div
          slot="reference"
          class="toolbarBtn"
          :style="{
            marginRight: dir === 'v' ? '0px' : '20px',
            marginBottom: dir === 'v' ? '10px' : '0px'
          }"
          :class="{ disabled: activeNodes.length <= 0 }"
        >
          <span class="icon iconfont iconstar"></span>
          <span class="text">{{ $t('toolbar.quickTag') }}</span>
        </div>
      </el-popover>
      <div
        v-if="item === 'summary'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasRoot || hasGeneralization
        }"
        @click="$bus.$emit('execCommand', 'ADD_GENERALIZATION')"
      >
        <span class="icon iconfont icongaikuozonglan"></span>
        <span class="text">{{ $t('toolbar.summary') }}</span>
      </div>
      <div
        v-if="item === 'associativeLine'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization
        }"
        @click="$bus.$emit('createAssociativeLine')"
      >
        <span class="icon iconfont iconlianjiexian"></span>
        <span class="text">{{ $t('toolbar.associativeLine') }}</span>
      </div>
      <div
        v-if="item === 'formula'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization
        }"
        @click="showFormula"
      >
        <span class="icon iconfont icongongshi"></span>
        <span class="text">{{ $t('toolbar.formula') }}</span>
      </div>
      <div
        v-if="item === 'attachment'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization
        }"
        @click="selectAttachmentFile"
      >
        <span class="icon iconfont iconfujian"></span>
        <span class="text">{{ $t('toolbar.attachment') }}</span>
      </div>
      <div
        v-if="item === 'outerFrame'"
        class="toolbarBtn"
        :class="{
          disabled: activeNodes.length <= 0 || hasGeneralization
        }"
        @click="$bus.$emit('execCommand', 'ADD_OUTER_FRAME')"
      >
        <span class="icon iconfont iconwaikuang"></span>
        <span class="text">{{ $t('toolbar.outerFrame') }}</span>
      </div>
      <NodeAnnotationBtn
        v-if="item === 'annotation' && supportMark"
        :isDark="isDark"
        :dir="dir"
        :rightHasBtn="annotationRightHasBtn"
        @setAnnotation="onSetAnnotation"
      ></NodeAnnotationBtn>
      <div
        v-if="item === 'ai'"
        class="toolbarBtn"
        :class="{
          disabled: hasGeneralization
        }"
        @click="aiCrate"
      >
        <span class="icon iconfont iconAIshengcheng"></span>
        <span class="text">{{ $t('toolbar.ai') }}</span>
      </div>
    </template>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { generateColorByContent } from 'simple-mind-map/src/utils/index'
import { nodeTagColorMap } from '@/config/nodeTag'
import { platformRequest } from '@/api/platformClient'
import NodeAnnotationBtn from './NodeAnnotationBtn.vue'

// 快捷标签预设
const quickTagGroups = [
  {
    title: '用例结构',
    columns: 3,
    tags: ['模块', '场景', '测试点', '前置条件', '操作步骤', '预期结果']
  },
  {
    title: '优先级',
    columns: 4,
    tags: ['P0', 'P1', 'P2', 'P3']
  },
  {
    title: '状态与缺陷',
    columns: 2,
    tags: ['🐛 BUG: #', '🐛 线上BUG: #']
  }
]
const maxTag = 5
const maxCustomQuickTag = 20
const maxQuickTagLength = 20
const customQuickTagPreferenceKey = 'customQuickTags'
const customQuickTagsChangeEvent = 'custom_quick_tags_change'
const presetQuickTags = quickTagGroups.reduce((result, group) => {
  return result.concat(group.tags)
}, [])
let customQuickTagsCache = null
let customQuickTagsLoadPromise = null

const requestCustomQuickTags = () => {
  if (customQuickTagsCache !== null) {
    return Promise.resolve(customQuickTagsCache)
  }
  if (!customQuickTagsLoadPromise) {
    customQuickTagsLoadPromise = platformRequest('/api/mindmap/preference')
      .then(response => {
        customQuickTagsCache =
          response && response.data
            ? response.data[customQuickTagPreferenceKey]
            : []
        return customQuickTagsCache
      })
      .finally(() => {
        customQuickTagsLoadPromise = null
      })
  }
  return customQuickTagsLoadPromise
}

export default {
  components: { NodeAnnotationBtn },
  props: {
    dir: {
      type: String,
      default: 'h'
    },
    list: {
      type: Array,
      default() {
        return []
      }
    }
  },
  data() {
    return {
      activeNodes: [],
      backEnd: true,
      forwardEnd: true,
      readonly: false,
      isFullDataFile: false,
      timer: null,
      isInPainter: false,
      quickTagGroups,
      quickTagPopoverShow: false,
      customQuickTags: [],
      quickTagAdding: false,
      quickTagLoading: false,
      quickTagLoaded: false,
      quickTagSaving: false,
      newQuickTag: '',
      maxQuickTagLength,
      // 当前激活节点（取第一个）的标签内容，用于高亮已选快捷标签
      activeNodeTags: []
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      supportMark: state => state.supportMark
    }),
    hasRoot() {
      return (
        this.activeNodes.findIndex(node => {
          return node.isRoot
        }) !== -1
      )
    },
    hasGeneralization() {
      return (
        this.activeNodes.findIndex(node => {
          return node.isGeneralization
        }) !== -1
      )
    },
    annotationRightHasBtn() {
      const index = this.list.findIndex(item => {
        return item === 'annotation'
      })
      return index !== -1 && index < this.list.length - 1
    }
  },
  watch: {
    quickTagPopoverShow(show) {
      if (!show) {
        this.cancelAddQuickTag()
      }
    }
  },
  created() {
    this.$bus.$on(customQuickTagsChangeEvent, this.onCustomQuickTagsChange)
    this.$bus.$on('mode_change', this.onModeChange)
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('back_forward', this.onBackForward)
    this.$bus.$on('painter_start', this.onPainterStart)
    this.$bus.$on('painter_end', this.onPainterEnd)
    this.loadCustomQuickTags()
  },
  beforeDestroy() {
    this.$bus.$off(customQuickTagsChangeEvent, this.onCustomQuickTagsChange)
    this.$bus.$off('mode_change', this.onModeChange)
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('back_forward', this.onBackForward)
    this.$bus.$off('painter_start', this.onPainterStart)
    this.$bus.$off('painter_end', this.onPainterEnd)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    generateColorByContent,

    getTagColor(tag) {
      return nodeTagColorMap[tag] || generateColorByContent(tag)
    },

    normalizeQuickTag(tag) {
      return typeof tag === 'string' ? tag.trim() : ''
    },

    normalizeCustomQuickTags(tags) {
      if (!Array.isArray(tags)) return []
      const uniqueTags = []
      tags.forEach(tag => {
        const text = this.normalizeQuickTag(tag)
        if (
          text &&
          text.length <= maxQuickTagLength &&
          !uniqueTags.includes(text) &&
          !presetQuickTags.includes(text) &&
          uniqueTags.length < maxCustomQuickTag
        ) {
          uniqueTags.push(text)
        }
      })
      return uniqueTags
    },

    async loadCustomQuickTags() {
      if (this.quickTagLoading) return false
      this.quickTagLoading = true
      try {
        const tags = await requestCustomQuickTags()
        this.onCustomQuickTagsChange(tags)
        return true
      } catch (error) {
        console.warn('加载自定义快捷标签失败:', error)
        return false
      } finally {
        this.quickTagLoading = false
      }
    },

    onCustomQuickTagsChange(tags) {
      this.customQuickTags = this.normalizeCustomQuickTags(tags)
      this.quickTagLoaded = true
    },

    async saveCustomQuickTags(tags) {
      if (this.quickTagSaving) return false
      this.quickTagSaving = true
      try {
        const response = await platformRequest('/api/mindmap/preference', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            settings: {
              [customQuickTagPreferenceKey]: tags
            }
          })
        })
        const savedTags =
          response && response.data
            ? response.data[customQuickTagPreferenceKey]
            : tags
        customQuickTagsCache = this.normalizeCustomQuickTags(savedTags)
        this.$bus.$emit(customQuickTagsChangeEvent, customQuickTagsCache)
        return true
      } catch (error) {
        console.warn('保存自定义快捷标签失败:', error)
        this.$message.error(this.$t('quickTag.saveFailed'))
        return false
      } finally {
        this.quickTagSaving = false
      }
    },

    async startAddQuickTag() {
      if (!this.quickTagLoaded) {
        const loaded = await this.loadCustomQuickTags()
        if (!loaded) {
          this.$message.error(this.$t('quickTag.loadFailed'))
          return
        }
      }
      if (this.customQuickTags.length >= maxCustomQuickTag) {
        this.$message.warning(
          this.$t('quickTag.limit', { max: maxCustomQuickTag })
        )
        return
      }
      this.quickTagAdding = true
      this.$nextTick(() => {
        if (this.$refs.quickTagInput) {
          this.$refs.quickTagInput.focus()
        }
      })
    },

    cancelAddQuickTag() {
      this.quickTagAdding = false
      this.newQuickTag = ''
    },

    async addCustomQuickTag() {
      const tag = this.normalizeQuickTag(this.newQuickTag)
      if (!tag || this.quickTagSaving) return
      if (this.customQuickTags.length >= maxCustomQuickTag) {
        this.$message.warning(
          this.$t('quickTag.limit', { max: maxCustomQuickTag })
        )
        return
      }
      if ([...presetQuickTags, ...this.customQuickTags].includes(tag)) {
        this.$message.warning(this.$t('quickTag.duplicate'))
        return
      }
      const saved = await this.saveCustomQuickTags([
        ...this.customQuickTags,
        tag
      ])
      if (saved) {
        this.cancelAddQuickTag()
      }
    },

    async removeCustomQuickTag(tag) {
      if (this.quickTagSaving) return
      await this.saveCustomQuickTags(
        this.customQuickTags.filter(item => item !== tag)
      )
    },

    // 监听模式切换
    onModeChange(mode) {
      this.readonly = mode === 'readonly'
    },

    // 监听节点激活
    onNodeActive(...args) {
      this.activeNodes = [...args[1]]
      this.refreshActiveNodeTags()
    },

    // 刷新当前激活节点的标签（用于高亮已选的快捷标签）
    refreshActiveNodeTags() {
      if (this.activeNodes.length > 0) {
        const tags = this.activeNodes[0].getData('tag') || []
        this.activeNodeTags = tags.map(item =>
          typeof item === 'string' ? item : item.text
        )
      } else {
        this.activeNodeTags = []
      }
    },

    // 快捷标签是否已应用到当前激活节点
    isTagActive(tag) {
      return this.activeNodeTags.includes(tag)
    },

    // 点击快捷标签：已存在则移除，否则追加（受最大数量限制）
    toggleQuickTag(tag) {
      if (this.activeNodes.length <= 0) return
      const adding = !this.isTagActive(tag)
      this.activeNodes.forEach(node => {
        const tags = (node.getData('tag') || []).slice()
        const index = tags.findIndex(item => {
          const text = typeof item === 'string' ? item : item.text
          return text === tag
        })
        if (adding) {
          if (index === -1 && tags.length < maxTag) {
            tags.push(tag)
          }
        } else if (index !== -1) {
          tags.splice(index, 1)
        }
        node.setTag(tags)
      })
      this.refreshActiveNodeTags()
    },

    // 监听前进后退
    onBackForward(index, len) {
      this.backEnd = index <= 0
      this.forwardEnd = index >= len - 1
    },

    // 开始格式刷
    onPainterStart() {
      this.isInPainter = true
    },

    // 格式刷结束
    onPainterEnd() {
      this.isInPainter = false
    },

    // 显示节点图标侧边栏
    showNodeIcon() {
      this.$bus.$emit('close_node_icon_toolbar')
      this.setActiveSidebar('nodeIconSidebar')
    },

    // 打开公式侧边栏
    showFormula() {
      this.setActiveSidebar('formulaSidebar')
    },

    // 选择附件
    selectAttachmentFile() {
      this.$bus.$emit('selectAttachment', this.activeNodes)
    },

    // 设置标记
    onSetAnnotation(...args) {
      this.$bus.$emit('execCommand', 'SET_NOTATION', this.activeNodes, ...args)
    },

    // AI生成整体
    aiCrate() {
      this.$bus.$emit('ai_create_all')
    }
  }
}
</script>

<style lang="less">
.toolbarNodeBtnList {
  display: flex;

  &.isDark {
    .toolbarBtn {
      color: hsla(0, 0%, 100%, 0.9);

      .icon {
        background: transparent;
        border-color: transparent;
      }

      &:hover {
        &:not(.disabled) {
          .icon {
            background: hsla(0, 0%, 100%, 0.05);
          }
        }
      }

      &.disabled {
        color: #54595f;
      }
    }
  }

  .toolbarBtn {
    display: flex;
    justify-content: center;
    flex-direction: column;
    cursor: pointer;
    margin-right: 20px;

    &:last-of-type {
      margin-right: 0;
    }
    &:hover {
      &:not(.disabled) {
        .icon {
          background: #f5f5f5;
        }
      }
    }

    &.active {
      .icon {
        background: #f5f5f5;
      }
    }

    &.disabled {
      color: #bcbcbc;
      cursor: not-allowed;
      pointer-events: none;
    }

    .icon {
      display: flex;
      height: 26px;
      background: #fff;
      border-radius: 4px;
      border: 1px solid #e9e9e9;
      justify-content: center;
      flex-direction: column;
      text-align: center;
      padding: 0 5px;
    }

    .text {
      margin-top: 3px;
      text-align: center;
    }
  }

  &.v {
    display: block;
    width: 120px;
    flex-wrap: wrap;

    .toolbarBtn {
      flex-direction: row;
      justify-content: flex-start;
      margin-bottom: 10px;
      width: 100%;
      margin-right: 0;

      &:last-of-type {
        margin-bottom: 0;
      }

      .icon {
        margin-right: 10px;
      }

      .text {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}

// 快捷标签弹窗（挂载在 body 上，样式不能 scoped）
.quickTagPopover {
  width: 320px;
  padding: 10px;

  .quickTagList {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: min(520px, calc(100vh - 40px));
    overflow-y: auto;
  }

  .quickTagGroupTitle {
    margin-bottom: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 16px;
  }

  .quickTagGroupItems {
    display: grid;
    gap: 5px;

    &.columns-2 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    &.columns-3 {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    &.columns-4 {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .quickTagItem {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    box-sizing: border-box;
    min-width: 0;
    height: 26px;
    padding: 4px 8px;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    opacity: 0.85;
    transition: opacity 0.2s;

    &:hover {
      opacity: 1;
    }

    &.active {
      padding-right: 20px;
      opacity: 1;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.25) inset;
    }

    .quickTagText {
      min-width: 0;
      overflow: hidden;
      font-size: 12px;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .checkIcon {
      position: absolute;
      right: 6px;
      font-size: 11px;
    }
  }

  .customQuickTagItem {
    padding-right: 30px;

    &.active {
      padding-right: 46px;

      .checkIcon {
        right: 29px;
      }
    }
  }

  .quickTagDeleteButton,
  .quickTagAddButton {
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .quickTagDeleteButton {
    position: absolute;
    top: 3px;
    right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 3px;
    color: inherit;
    opacity: 0.75;

    &:hover:not(:disabled) {
      background: rgba(0, 0, 0, 0.2);
      opacity: 1;
    }

    &:disabled {
      cursor: wait;
    }
  }

  .quickTagAddArea {
    padding-top: 8px;
    border-top: 1px solid #ebeef5;
  }

  .quickTagAddButton {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 6px;
    color: #606266;
    font-size: 12px;

    &:hover:not(:disabled) {
      color: #409eff;
    }

    &:disabled {
      color: #c0c4cc;
      cursor: wait;
    }
  }

  .quickTagAddForm {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 6px;

    .el-button {
      margin-left: 0;
    }
  }
}

body.isDark .quickTagPopover {
  .quickTagGroupTitle,
  .quickTagAddButton {
    color: hsla(0, 0%, 100%, 0.7);
  }

  .quickTagAddArea {
    border-top-color: hsla(0, 0%, 100%, 0.12);
  }
}
</style>
