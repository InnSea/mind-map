<template>
  <div>
    <!-- 客户端连接失败提示弹窗 -->
    <el-dialog
      class="clientTipDialog"
      :title="$t('ai.connectFailedTitle')"
      :visible.sync="clientTipDialogVisible"
      width="400px"
      append-to-body
    >
      <div class="tipBox">
        <p>{{ $t('ai.connectFailedTip') }}</p>
        <p>
          {{ $t('ai.connectFailedCheckTip1')
          }}<a
            href="https://pan.baidu.com/s/1huasEbKsGNH2Af68dvWiOg?pwd=3bp3"
            >{{ $t('ai.baiduNetdisk') }}</a
          >、<a href="https://github.com/wanglin2/mind-map/releases">Github</a>
        </p>
        <p>{{ $t('ai.connectFailedCheckTip2') }}</p>
        <P>{{ $t('ai.connectFailedCheckTip3') }}</P>
        <p>
          {{ $t('ai.connectFailedCheckTip4')
          }}<el-button size="small" @click="testConnect">{{
            $t('ai.connectionDetection')
          }}</el-button>
        </p>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button
          size="mini"
          type="primary"
          @click="clientTipDialogVisible = false"
          >{{ $t('ai.close') }}</el-button
        >
      </div>
    </el-dialog>
    <!-- ai内容输入弹窗 -->
    <el-dialog
      class="createDialog"
      :class="{ isDark }"
      :title="$t('ai.createMindMapTitle')"
      :visible.sync="createDialogVisible"
      :width="platformAiContext ? '620px' : '450px'"
      append-to-body
    >
      <div class="inputBox">
        <div v-if="platformAiContext" class="documentSection">
          <div class="documentHeader">
            <div>
              <div class="documentTitle">参考文档</div>
              <div class="documentSubtitle">选择本次生成使用的导图关联文档</div>
            </div>
            <el-checkbox
              v-if="documentCount"
              :indeterminate="documentSelectionIndeterminate"
              :value="allDocumentsSelected"
              :disabled="documentScopeLoading"
              @change="toggleAllDocuments"
              >{{ documentScopeLoading ? '处理中' : '全选' }}</el-checkbox
            >
          </div>
          <div v-if="documentNodes.length" class="documentList documentTree">
            <template v-for="row in documentTreeRows">
              <button
                v-if="row.node.type !== 'item'"
                :key="row.node.key"
                type="button"
                class="documentDirectory"
                :class="{ documentProject: row.depth === 0 }"
                :style="{ paddingLeft: `${10 + row.depth * 18}px` }"
                @click="toggleDocumentNode(row.node)"
              >
                <i
                  v-if="row.node.hasChildren"
                  :class="
                    row.node.loading
                      ? 'el-icon-loading'
                      : isDocumentNodeExpanded(row.node.key)
                        ? 'el-icon-arrow-down'
                        : 'el-icon-arrow-right'
                  "
                />
                <i v-else class="documentDirectorySpacer" />
                <i class="el-icon-folder" />
                <span class="documentProjectName">{{ row.node.title }}</span>
                <span v-if="row.node.count != null" class="documentProjectCount">
                  {{ row.node.count }} 篇
                </span>
              </button>
              <label
                v-else
                :key="row.node.key"
                class="documentItem"
                :style="{ paddingLeft: '18px' }"
              >
                <el-checkbox v-model="selectedDocumentIds" :label="row.node.item.id">
                  <span class="documentName">{{ row.node.item.title }}</span>
                </el-checkbox>
                <span class="documentMeta">
                  <span v-if="row.node.item.isLinked" class="linkedDocumentTag">已关联</span>
                  <!-- {{ row.node.item.wordCount || 0 }} 词 -->
                </span>
              </label>
            </template>
          </div>
          <div v-else class="documentEmpty">
            <i class="el-icon-document" />
            当前导图暂无关联文档
          </div>
        </div>
        <div v-if="platformAiContext" class="promptLabel">
          补充生成要求（可选）
        </div>
        <el-input
          type="textarea"
          :rows="platformAiContext ? 4 : 5"
          :placeholder="
            platformAiContext
              ? '例如：重点覆盖权限、弱网和异常状态流转'
              : $t('ai.createTip')
          "
          :maxlength="platformAiContext ? 2000 : undefined"
          :show-word-limit="Boolean(platformAiContext)"
          v-model="aiInput"
        >
        </el-input>
        <div class="tip warning">
          {{ $t('ai.importantTip') }}
        </div>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button size="mini" @click="closeAiCreateDialog">{{
          $t('ai.cancel')
        }}</el-button>
        <el-button size="mini" type="primary" @click="doAiCreate">{{
          $t('ai.confirm')
        }}</el-button>
      </div>
    </el-dialog>
    <!-- ai生成中添加一个透明层，防止期间用户进行操作 -->
    <div
      class="aiCreatingMask"
      :class="{ isDark }"
      ref="aiCreatingMaskRef"
      v-show="aiCreatingMaskVisible"
    >
      <div class="creatingStatus">
        <div class="creatingHeader">
          <div class="creatingIdentity">
            <div class="creatingHeading">
              <strong>AI 正在生成导图</strong>
              <span>{{ generationElapsedText }}</span>
            </div>
          </div>
          <el-button
            class="stopGeneratingButton"
            size="mini"
            :aria-label="$t('ai.stopGenerating')"
            @click="stopCreate"
          >
            <i class="el-icon-close" />
            <span>{{ $t('ai.stopGenerating') }}</span>
          </el-button>
        </div>
        <div
          v-if="platformAiContext"
          class="generationSteps"
          :style="generationStepsGridStyle"
        >
          <span class="stepTrack" :style="generationStepsTrackStyle">
            <span :style="generationTimelineProgressStyle" />
          </span>
          <div
            v-for="(step, index) in generationSteps"
            :key="step.key"
            class="generationStep"
            :class="{
              done: index < generationStageIndex,
              active: index === generationStageIndex
            }"
          >
            <span class="stepMarker">
              <i v-if="index < generationStageIndex" class="el-icon-check" />
            </span>
            <span class="stepLabel">{{ step.label }}</span>
          </div>
        </div>
        <div class="generationActivity">
          <span class="activityDot" />
          <span class="activityText" role="status" aria-live="polite">
            {{ generationStatus || '正在准备生成内容' }}
          </span>
          <span v-if="generatedNodeCount" class="nodeCount">
            {{ generatedNodeCount }} 个节点
          </span>
        </div>
      </div>
    </div>
    <!-- AI续写 -->
    <el-dialog
      class="createDialog"
      :title="$t('ai.aiCreatePart')"
      :visible.sync="createPartDialogVisible"
      width="450px"
      append-to-body
    >
      <div class="inputBox">
        <div class="promptLabel">补充续写要求（可选）</div>
        <el-input
          type="textarea"
          :rows="5"
          maxlength="2000"
          show-word-limit
          placeholder="例如：补充权限不足和重复操作场景；留空则根据当前节点自动续写"
          v-model="aiPartInput"
        >
        </el-input>
      </div>
      <div slot="footer" class="dialog-footer">
        <el-button size="mini" @click="closeAiCreatePartDialog">{{
          $t('ai.cancel')
        }}</el-button>
        <el-button size="mini" type="primary" @click="confirmAiCreatePart">{{
          $t('ai.confirm')
        }}</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import Ai from '@/utils/ai'
import { transformMarkdownTo } from 'simple-mind-map/src/parse/markdownTo'
import {
  createUid,
  isUndef,
  checkNodeOuter,
  getStrWithBrFromHtml
} from 'simple-mind-map/src/utils'

const aiMarkerTagMap = {
  P0: 'P0',
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  需确认: '待定',
  前置条件: '前置条件',
  测试数据: '测试数据',
  操作步骤: '操作步骤',
  预期结果: '预期结果'
}
const aiTagMarkerPattern = /\[(P[0-3]|需确认|前置条件|测试数据|操作步骤|预期结果)\]/g
const aiContinuationRoleTransitions = {
  structural: ['structural', 'test_case'],
  test_case: ['precondition', 'test_data', 'operation'],
  precondition: ['test_data', 'operation'],
  test_data: ['operation'],
  operation: ['expected_result', 'operation'],
  expected_result: ['operation']
}
const aiSemanticNodeRoles = [
  'precondition',
  'test_data',
  'operation',
  'expected_result'
]

const getAiNodeRole = data => {
  const tags = Array.isArray(data && data.tag) ? data.tag : []
  const tagTexts = tags.map(tag =>
    typeof tag === 'string' ? tag : tag && (tag.text || tag.label || tag.name)
  )
  if (tagTexts.includes('前置条件')) return 'precondition'
  if (tagTexts.includes('测试数据')) return 'test_data'
  if (tagTexts.includes('操作步骤')) return 'operation'
  if (tagTexts.includes('预期结果')) return 'expected_result'
  if (tagTexts.some(tag => /^P[0-3]$/.test(tag || ''))) return 'test_case'
  return 'structural'
}

const nodeUsesAiSemanticTag = node => {
  if (!node || typeof node.getData !== 'function') return false
  return aiSemanticNodeRoles.includes(
    getAiNodeRole({ tag: node.getData('tag') || [] })
  )
}

const continuationBranchUsesSemanticTags = node => {
  let current = node
  while (current) {
    if (nodeUsesAiSemanticTag(current)) return true
    current = current.parent
  }

  const walk = currentNode => {
    if (!currentNode) return false
    if (nodeUsesAiSemanticTag(currentNode)) return true
    return (currentNode.children || []).some(child => walk(child))
  }
  return walk(node)
}

export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      aiInstance: null,
      isAiCreating: false,
      aiCreatingContent: '',

      isLoopRendering: false,
      uidMap: {},
      latestUid: '',

      clientTipDialogVisible: false,
      createDialogVisible: false,
      aiInput: '',
      aiCreatingMaskVisible: false,
      platformAiContext: null,
      selectedDocumentIds: [],
      documentNodes: [],
      expandedDocumentNodes: [],
      documentCount: 0,
      documentScopeLoading: false,
      documentTreeLoadSerial: 0,
      generationStatus: '',
      generationStage: 'reading',
      generationElapsedSeconds: 0,
      generationTimer: null,
      generationFailed: false,
      fullGenerationDataCache: '',

      mindMapDataCache: '',
      beingAiCreateNodeUid: '',
      beingAiCreateNodeRole: '',
      beingAiCreateUsesSemanticTags: false,

      createPartDialogVisible: false,
      aiPartInput: '',
      beingCreatePartNode: null
    }
  },
  created() {
    this.$bus.$on('ai_create_all', this.aiCrateAll)
    this.$bus.$on('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$on('ai_chat', this.aiChat)
    this.$bus.$on('ai_chat_stop', this.aiChatStop)
  },
  mounted() {
    document.body.appendChild(this.$refs.aiCreatingMaskRef)
  },
  beforeDestroy() {
    this.$bus.$off('ai_create_all', this.aiCrateAll)
    this.$bus.$off('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$off('ai_chat', this.aiChat)
    this.$bus.$off('ai_chat_stop', this.aiChatStop)
    this.stopGenerationTimer()
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    },
    documentTreeRows() {
      const rows = []
      const appendNodes = (nodes, depth = 0) => {
        (nodes || []).forEach(node => {
          rows.push({ node, depth })
          if (node.type !== 'item' && this.isDocumentNodeExpanded(node.key)) {
            appendNodes(node.children, depth + 1)
          }
        })
      }
      appendNodes(this.documentNodes)
      return rows
    },
    allDocumentsSelected() {
      return (
        this.documentCount > 0 &&
        this.selectedDocumentIds.length === this.documentCount
      )
    },
    documentSelectionIndeterminate() {
      const count = this.selectedDocumentIds.length
      return count > 0 && count < this.documentCount
    },
    generationSteps() {
      return [
        { key: 'reading', label: '读取需求' },
        { key: 'organizing', label: '整理上下文' },
        { key: 'generating', label: '生成节点' }
      ]
    },
    generationStageIndex() {
      const index = this.generationSteps.findIndex(
        step => step.key === this.generationStage
      )
      return index === -1 ? 0 : index
    },
    generationTimelineProgressStyle() {
      const maxIndex = Math.max(this.generationSteps.length - 1, 1)
      return {
        width: `${(this.generationStageIndex / maxIndex) * 100}%`
      }
    },
    generationStepsGridStyle() {
      return {
        gridTemplateColumns: `repeat(${this.generationSteps.length}, minmax(0, 1fr))`
      }
    },
    generationStepsTrackStyle() {
      const inset = `${100 / (2 * Math.max(this.generationSteps.length, 1))}%`
      return {
        left: inset,
        right: inset
      }
    },
    generationElapsedText() {
      const seconds = this.generationElapsedSeconds
      if (seconds < 1) return '刚刚开始'
      if (seconds < 60) return `已用时 ${seconds} 秒`
      const minutes = Math.floor(seconds / 60)
      const restSeconds = seconds % 60
      return `已用时 ${minutes} 分 ${restSeconds} 秒`
    },
    generatedNodeCount() {
      if (!this.aiCreatingContent) return 0
      return this.aiCreatingContent
        .split('\n')
        .filter(line => /^\s*(?:#\s+|-\s+)/.test(line)).length
    }
  },
  methods: {
    // 客户端连接检测
    async testConnect() {
      try {
        await fetch('https://test.classtorch.com/api/ai/test', {
          method: 'GET',
          timeout: 60000
        })
        this.$message.success(this.$t('ai.connectSuccessful'))
        this.clientTipDialogVisible = false
        this.createDialogVisible = true
      } catch (error) {
        console.log(error)
        this.$message.error(this.$t('ai.connectFailed'))
      }
    },

    // 检测ai是否可用
    async aiTest() {
      let isConnect = false
      try {
        await fetch('https://test.classtorch.com/api/ai/test', {
          method: 'GET'
        })
        isConnect = true
      } catch (error) {
        console.log(error)
        this.clientTipDialogVisible = true
      }
      if (!isConnect) {
        throw new Error(this.$t('ai.connectFailed'))
      }
    },

    // AI生成整体
    async aiCrateAll() {
      const getContext = window.takeOverApp && window.parent.getAiMindmapContext
      if (typeof getContext === 'function') {
        try {
          const context = await getContext()
          if (!context || !context.canGenerate) {
            this.$message.warning('当前状态下不可使用 AI 覆盖生成导图')
            return
          }
          this.platformAiContext = context
          const linkedDocuments = Array.isArray(context.documents)
            ? context.documents.filter(item => item.isLinked !== false)
            : []
          this.documentNodes = linkedDocuments.map(item => ({
            key: `linked-document-${item.id}`,
            type: 'item',
            item
          }))
          this.documentCount = linkedDocuments.length
          this.expandedDocumentNodes = []
          this.documentTreeLoadSerial += 1
          const linkedDocumentIds = linkedDocuments.map(item => item.id)
          this.selectedDocumentIds = [...new Set(linkedDocumentIds)]
          this.createDialogVisible = true
          return
        } catch (error) {
          console.log(error)
          this.$message.error('获取导图关联文档失败')
          return
        }
      }
      this.platformAiContext = null
      try {
        await this.aiTest()
        this.createDialogVisible = true
      } catch (error) {
        console.log(error)
      }
    },

    // 关闭ai内容输入弹窗
    closeAiCreateDialog() {
      this.createDialogVisible = false
      this.aiInput = ''
      this.documentTreeLoadSerial += 1
      this.documentScopeLoading = false
    },

    async toggleAllDocuments(checked) {
      if (!checked) {
        this.selectedDocumentIds = []
        return
      }
      const linkedDocuments = (this.platformAiContext && this.platformAiContext.documents) || []
      this.selectedDocumentIds = [
        ...new Set(
          linkedDocuments
            .filter(item => item.isLinked !== false)
            .map(item => item.id)
        )
      ]
    },

    isDocumentNodeExpanded(nodeKey) {
      return this.expandedDocumentNodes.includes(nodeKey)
    },

    async toggleDocumentNode(node) {
      if (!node || !node.hasChildren || node.loading) return
      if (this.isDocumentNodeExpanded(node.key)) {
        this.expandedDocumentNodes = this.expandedDocumentNodes.filter(
          key => key !== node.key
        )
        return
      }
      this.expandedDocumentNodes = [...this.expandedDocumentNodes, node.key]
      if (node.loaded) return
      const loadNodes =
        window.takeOverApp && window.parent.loadAiMindmapDocumentNodes
      if (typeof loadNodes !== 'function') {
        this.expandedDocumentNodes = this.expandedDocumentNodes.filter(
          key => key !== node.key
        )
        this.$message.error('文档目录服务不可用')
        return
      }
      const serial = this.documentTreeLoadSerial
      this.$set(node, 'loading', true)
      try {
        const children = await loadNodes({
          type: node.type,
          id: node.id,
          groupId: node.groupId
        })
        if (serial !== this.documentTreeLoadSerial) return
        this.$set(node, 'children', children || [])
        this.$set(node, 'loaded', true)
      } catch (error) {
        console.log(error)
        if (serial === this.documentTreeLoadSerial) {
          this.expandedDocumentNodes = this.expandedDocumentNodes.filter(
            key => key !== node.key
          )
          this.$message.error('文档目录加载失败')
        }
      } finally {
        if (serial === this.documentTreeLoadSerial) {
          this.$set(node, 'loading', false)
        }
      }
    },

    // 确认生成
    doAiCreate() {
      const aiInputText = this.aiInput.trim()
      if (!aiInputText && this.selectedDocumentIds.length === 0) {
        this.$message.warning(this.$t('ai.noInputTip'))
        return
      }
      if (this.platformAiContext) {
        this.doPlatformAiCreate(aiInputText)
        return
      }
      this.closeAiCreateDialog()
      this.startGenerationProgress('generating', '正在生成导图结构与测试节点')
      this.aiCreatingMaskVisible = true
      // 发起请求
      this.isAiCreating = true
      this.aiInstance = new Ai()
      this.mindMap.renderer.setRootNodeCenter()
      this.mindMap.setData({
        data: { text: '', expand: true, uid: createUid() },
        children: []
      })
      this.aiInstance.request(
        {
          messages: [
            {
              role: 'user',
              content: `${this.$t(
                'ai.aiCreateMsgPrefix'
              )}${aiInputText}${this.$t('ai.aiCreateMsgPostfix')}`
            }
          ]
        },
        content => {
          if (content) {
            const arr = content.split(/\n+/)
            this.aiCreatingContent = arr.splice(0, arr.length - 1).join('\n')
          }
          this.loopRenderOnAiCreating()
        },
        content => {
          this.aiCreatingContent = content
          this.resetOnAiCreatingStop()
          this.loopRenderOnAiCreating(true)
        },
        () => {
          this.resetOnAiCreatingStop()
          this.resetOnRenderEnd()
          this.$message.error(this.$t('ai.generationFailed'))
        }
      )
    },

    doPlatformAiCreate(aiInputText) {
      const generate = window.parent.generateMindmapWithAi
      if (typeof generate !== 'function') {
        this.$message.error('平台 AI 生成服务不可用')
        return
      }
      const payload = {
        mindmap_id: this.platformAiContext.mindmapId,
        prompt: aiInputText || null,
        document_ids: [...this.selectedDocumentIds]
      }
      this.closeAiCreateDialog()
      this.startGenerationProgress('reading', '正在读取已选择的参考文档')
      this.generationFailed = false
      this.aiCreatingContent = ''
      this.fullGenerationDataCache = JSON.stringify(this.mindMap.getData())
      this.aiCreatingMaskVisible = true
      this.isAiCreating = true
      this.mindMap.renderer.setRootNodeCenter()
      this.mindMap.setData({
        data: { text: '', expand: true, uid: createUid() },
        children: []
      })

      const stream = generate(payload, {
        onStatus: data => {
          this.generationStatus = data.message || this.generationStatus
          this.generationStage = data.stage || this.generationStage
        },
        onDelta: data => {
          if (!data.content) return
          this.generationStage = 'generating'
          this.generationStatus = '正在生成导图结构与测试节点'
          this.aiCreatingContent += data.content
          this.loopRenderOnAiCreating()
        },
        onError: data => {
          this.generationFailed = true
          this.restorePlatformGenerationData()
          this.resetOnAiCreatingStop()
          this.resetOnRenderEnd()
          this.$message.error(data.message || this.$t('ai.generationFailed'))
        },
        onDone: () => {
          if (this.generationFailed) return
          if (!this.aiCreatingContent.trim()) {
            this.restorePlatformGenerationData()
            this.resetOnAiCreatingStop()
            this.resetOnRenderEnd()
            this.$message.error(this.$t('ai.generationFailed'))
            return
          }
          this.resetOnAiCreatingStop()
          this.loopRenderOnAiCreating(true)
        }
      })
      this.aiInstance = {
        stop: () => stream && stream.abort && stream.abort()
      }
    },

    restorePlatformGenerationData() {
      if (!this.fullGenerationDataCache) return
      try {
        this.mindMap.setData(JSON.parse(this.fullGenerationDataCache))
      } catch (error) {
        console.log(error)
      }
      this.fullGenerationDataCache = ''
    },

    startGenerationProgress(stage, status) {
      this.stopGenerationTimer()
      this.generationStage = stage
      this.generationStatus = status
      this.generationElapsedSeconds = 0
      const startedAt = Date.now()
      this.generationTimer = window.setInterval(() => {
        this.generationElapsedSeconds = Math.floor(
          (Date.now() - startedAt) / 1000
        )
      }, 1000)
    },

    stopGenerationTimer() {
      if (this.generationTimer) {
        window.clearInterval(this.generationTimer)
        this.generationTimer = null
      }
    },

    // AI请求完成或出错后需要复位的数据
    resetOnAiCreatingStop() {
      this.stopGenerationTimer()
      this.aiCreatingMaskVisible = false
      this.isAiCreating = false
      this.aiInstance = null
      this.generationStatus = ''
      this.generationStage = 'reading'
      this.generationElapsedSeconds = 0
    },

    // 渲染结束后需要复位的数据
    resetOnRenderEnd() {
      this.isLoopRendering = false
      this.uidMap = {}
      this.aiCreatingContent = ''
      this.mindMapDataCache = ''
      this.fullGenerationDataCache = ''
      this.beingAiCreateNodeUid = ''
      this.beingAiCreateNodeRole = ''
      this.beingAiCreateUsesSemanticTags = false
    },

    // 停止生成
    stopCreate() {
      if (this.aiInstance) {
        this.aiInstance.stop()
      }
      if (!this.aiCreatingContent.trim()) {
        this.restorePlatformGenerationData()
      }
      this.resetOnAiCreatingStop()
      this.$message.success(this.$t('ai.stoppedGenerating'))
    },

    // 轮询进行渲染
    parseAiCreatingTree() {
      let content = this.aiCreatingContent
      if (this.isAiCreating && !content.endsWith('\n')) {
        content = content.slice(0, content.lastIndexOf('\n') + 1)
      }
      if (!content.trim()) return null
      try {
        const normalize = node => {
          if (!node || !node.data) return null
          const markerTags = []
          const text = String(node.data.text || '')
            .replace(aiTagMarkerPattern, (match, marker) => {
              const tag = aiMarkerTagMap[marker]
              if (tag && !markerTags.includes(tag)) markerTags.push(tag)
              return ''
            })
            .replace(/\s{2,}/g, ' ')
            .trim()
          if (!text) return null
          const data = { ...node.data, text }
          if (markerTags.length) data.tag = markerTags.slice(0, 5)
          return {
            ...node,
            data,
            children: (Array.isArray(node.children) ? node.children : [])
              .map(child => normalize(child))
              .filter(Boolean)
          }
        }
        return normalize(transformMarkdownTo(content))
      } catch (error) {
        return null
      }
    },

    loopRenderOnAiCreating(showInvalidError = false) {
      if (!this.aiCreatingContent.trim() || this.isLoopRendering) return
      const treeData = this.parseAiCreatingTree()
      if (!treeData) {
        if (showInvalidError) {
          this.restorePlatformGenerationData()
          this.resetOnRenderEnd()
          this.$message.error('AI 返回的导图格式无效，请重新生成')
        }
        return
      }
      this.isLoopRendering = true
      this.addUid(treeData)
      let lastTreeData = JSON.stringify(treeData)

      // 在当前渲染完成时再进行下一次渲染
      const onRenderEnd = () => {
        // 处理超出画布的节点
        this.checkNodeOuter()

        // 如果生成结束数据渲染完毕，那么解绑事件
        if (!this.isAiCreating && !this.aiCreatingContent) {
          this.mindMap.off('node_tree_render_end', onRenderEnd)
          this.latestUid = ''
          return
        }

        const treeData = this.parseAiCreatingTree()
        if (!treeData) {
          setTimeout(() => {
            onRenderEnd()
          }, 300)
          return
        }
        this.addUid(treeData)
        // 正在生成中
        if (this.isAiCreating) {
          // 如果和上次数据一样则不触发重新渲染
          const curTreeData = JSON.stringify(treeData)
          if (curTreeData === lastTreeData) {
            setTimeout(() => {
              onRenderEnd()
            }, 500)
            return
          }
          lastTreeData = curTreeData
          this.mindMap.updateData(treeData)
        } else {
          // 已经生成结束
          // 还要触发一遍渲染，否则会丢失数据
          this.mindMap.updateData(treeData)
          this.resetOnRenderEnd()
          this.$message.success(this.$t('ai.aiGenerationSuccess'))
        }
      }
      this.mindMap.on('node_tree_render_end', onRenderEnd)

      this.mindMap.setData(treeData)
    },

    // 处理超出画布的节点
    checkNodeOuter() {
      if (this.latestUid) {
        const latestNode = this.mindMap.renderer.findNodeByUid(this.latestUid)
        if (latestNode) {
          const { isOuter, offsetLeft, offsetTop } = checkNodeOuter(
            this.mindMap,
            latestNode,
            100,
            100
          )
          if (isOuter) {
            this.mindMap.view.translateXY(offsetLeft, offsetTop)
          }
        }
      }
    },

    // 给AI生成的数据添加uid
    addUid(data) {
      if (!data) return
      const checkRepeatUidMap = {}
      const walk = (node, pUid = '') => {
        if (!node) return
        if (!node.data) {
          node.data = {}
        }
        if (isUndef(node.data.uid)) {
          // 根据pUid+文本内容来复用上一次生成数据的uid
          const key = pUid + '-' + node.data.text
          node.data.uid = this.uidMap[key] || createUid()
          // 当前uid和之前的重复，那么重新生成一个。这种情况很少，但是以防万一
          if (checkRepeatUidMap[node.data.uid]) {
            node.data.uid = createUid()
          }
          this.latestUid = this.uidMap[key] = node.data.uid
          checkRepeatUidMap[node.data.uid] = true
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            walk(child, node.data.uid)
          })
        }
      }
      walk(data)
    },

    // 获取从当前节点到根节点的路径链
    getNodePathToRoot(node) {
      const path = []
      let currentNode = node
      while (currentNode) {
        path.unshift({
          text: getStrWithBrFromHtml(currentNode.getData('text')),
          note: currentNode.getData('note') || '',
          tag: currentNode.getData('tag') || []
        })
        currentNode = currentNode.parent
      }
      return path
    },

    // 将路径链格式化为可读字符串
    formatNodePath(path) {
      return path
        .map((item, index) => {
          let nodeInfo = `${'  '.repeat(index)}${index === 0 ? '' : '└─ '}${
            item.text
          }`
          if (item.note) {
            nodeInfo += ` (备注: ${item.note})`
          }
          if (item.tag && item.tag.length > 0) {
            const tags = Array.isArray(item.tag)
              ? item.tag
                  .map(t => (typeof t === 'string' ? t : t.text))
                  .join(', ')
              : item.tag
            nodeInfo += ` [标签: ${tags}]`
          }
          return nodeInfo
        })
        .join('\n')
    },

    // 显示AI续写弹窗
    async showAiCreatePartDialog(node) {
      this.beingCreatePartNode = node
      this.aiPartInput = ''
      const getContext = window.takeOverApp && window.parent.getAiMindmapContext
      if (typeof getContext === 'function') {
        try {
          const context = await getContext()
          if (!context || !context.canGenerate) {
            this.$message.warning('当前状态下不可使用 AI 续写导图')
            this.resetAiCreatePartDialog()
            return
          }
          this.platformAiContext = context
        } catch (error) {
          console.log(error)
          this.$message.error('获取导图上下文失败')
          this.resetAiCreatePartDialog()
          return
        }
      } else {
        this.platformAiContext = null
      }
      this.createPartDialogVisible = true
    },

    // 关闭AI续写弹窗
    closeAiCreatePartDialog() {
      this.createPartDialogVisible = false
    },

    // 复位AI续写弹窗数据
    resetAiCreatePartDialog() {
      this.beingCreatePartNode = null
      this.aiPartInput = ''
    },

    // 确认AI续写
    confirmAiCreatePart() {
      this.closeAiCreatePartDialog()
      this.aiCreatePart()
    },

    // AI生成部分
    async aiCreatePart() {
      try {
        if (!this.beingCreatePartNode) {
          return
        }
        if (this.platformAiContext) {
          this.doPlatformAiContinue()
          return
        }
        await this.aiTest()
        this.beingAiCreateNodeUid = this.beingCreatePartNode.getData('uid')
        this.beingAiCreateNodeRole = getAiNodeRole({
          tag: this.beingCreatePartNode.getData('tag') || []
        })
        this.beingAiCreateUsesSemanticTags = continuationBranchUsesSemanticTags(
          this.beingCreatePartNode
        )
        const currentMindMapData = this.mindMap.getData()
        this.mindMapDataCache = JSON.stringify(currentMindMapData)
        this.aiCreatingMaskVisible = true
        // 发起请求
        this.isAiCreating = true
        this.aiInstance = new Ai()
        this.aiInstance.request(
          {
            messages: [
              {
                role: 'user',
                content: `${this.$t(
                  'ai.aiCreatePartMsgPrefix'
                )}${this.formatNodePath(
                  this.getNodePathToRoot(this.beingCreatePartNode)
                )}${this.$t('ai.aiCreatePartMsgCenter')}${getStrWithBrFromHtml(
                  this.beingCreatePartNode.getData('text')
                )}${this.$t(
                  'ai.aiCreatePartMsgPostfix'
                )}。用户补充要求：${this.aiPartInput.trim() || '无'}${this.$t(
                  'ai.aiCreatePartMsgHelp'
                )}`
              }
            ]
          },
          content => {
            if (content) {
              const arr = content.split(/\n+/)
              this.aiCreatingContent = arr.splice(0, arr.length - 1).join('\n')
            }

            this.loopRenderOnAiCreatingPart()
          },
          content => {
            this.aiCreatingContent = content
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            this.loopRenderOnAiCreatingPart()
          },
          () => {
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            this.resetOnRenderEnd()
            this.$message.error(this.$t('ai.generationFailed'))
          }
        )
      } catch (error) {
        console.log(error)
      }
    },

    doPlatformAiContinue() {
      const continueMindmap = window.parent.continueMindmapWithAi
      if (typeof continueMindmap !== 'function') {
        this.$message.error('平台 AI 续写服务不可用')
        this.resetAiCreatePartDialog()
        return
      }

      this.beingAiCreateNodeUid = this.beingCreatePartNode.getData('uid')
      this.beingAiCreateNodeRole = getAiNodeRole({
        tag: this.beingCreatePartNode.getData('tag') || []
      })
      this.beingAiCreateUsesSemanticTags = continuationBranchUsesSemanticTags(
        this.beingCreatePartNode
      )
      const currentMindMapData = this.mindMap.getData()
      this.mindMapDataCache = JSON.stringify(currentMindMapData)
      const payload = {
        mindmap_id: this.platformAiContext.mindmapId,
        content: this.mindMapDataCache,
        target_uid: this.beingAiCreateNodeUid,
        prompt: this.aiPartInput.trim() || null
      }

      this.startGenerationProgress('reading', '正在读取节点上下文与关联需求')
      this.generationFailed = false
      this.aiCreatingContent = ''
      this.aiCreatingMaskVisible = true
      this.isAiCreating = true

      const stream = continueMindmap(payload, {
        onStatus: data => {
          this.generationStatus = data.message || this.generationStatus
          this.generationStage = data.stage || this.generationStage
        },
        onDelta: data => {
          if (!data.content) return
          this.generationStage = 'generating'
          this.generationStatus = '正在续写目标节点'
          this.aiCreatingContent += data.content
          this.loopRenderOnAiCreatingPart()
        },
        onError: data => {
          this.generationFailed = true
          this.restorePartGenerationData()
          this.resetOnAiCreatingStop()
          this.resetAiCreatePartDialog()
          this.resetOnRenderEnd()
          this.$message.error(data.message || this.$t('ai.generationFailed'))
        },
        onDone: () => {
          if (this.generationFailed) return
          if (!this.aiCreatingContent.trim()) {
            this.restorePartGenerationData()
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            this.resetOnRenderEnd()
            this.$message.error(this.$t('ai.generationFailed'))
            return
          }
          this.resetOnAiCreatingStop()
          this.resetAiCreatePartDialog()
          this.loopRenderOnAiCreatingPart()
        }
      })
      this.aiInstance = {
        stop: () => stream && stream.abort && stream.abort()
      }
    },

    restorePartGenerationData() {
      if (!this.mindMapDataCache) return
      try {
        this.mindMap.setData(JSON.parse(this.mindMapDataCache))
      } catch (error) {
        console.log(error)
      }
    },

    validateContinuationChildren(children) {
      if (
        !this.platformAiContext ||
        !this.beingAiCreateUsesSemanticTags ||
        this.beingAiCreateNodeRole === 'structural'
      ) {
        return {
          children: Array.isArray(children) ? children : [],
          invalidCount: 0
        }
      }
      let invalidCount = 0
      const validate = (node, parentRole) => {
        const role = getAiNodeRole(node && node.data)
        const allowedRoles = aiContinuationRoleTransitions[parentRole] || []
        if (!allowedRoles.includes(role)) {
          invalidCount += 1
          return null
        }
        return {
          ...node,
          children: (Array.isArray(node.children) ? node.children : [])
            .map(child => validate(child, role))
            .filter(Boolean)
        }
      }
      return {
        children: (Array.isArray(children) ? children : [])
          .map(child => validate(child, this.beingAiCreateNodeRole))
          .filter(Boolean),
        invalidCount
      }
    },

    // 将生成的数据添加到指定节点上
    addToTargetNode(newChildren = []) {
      const initData = JSON.parse(this.mindMapDataCache)
      const walk = node => {
        if (node.data.uid === this.beingAiCreateNodeUid) {
          if (!node.children) {
            node.children = []
          }
          node.children.push(...newChildren)
          return
        }
        if (node.children && node.children.length > 0) {
          node.children.forEach(child => {
            walk(child)
          })
        }
      }
      walk(initData)
      return initData
    },

    // 轮询进行部分渲染
    loopRenderOnAiCreatingPart() {
      if (!this.aiCreatingContent.trim() || this.isLoopRendering) return
      const partData = this.parseAiCreatingTree()
      if (!partData) return
      const validation = this.validateContinuationChildren(
        partData.children || []
      )
      if (!validation.children.length && validation.invalidCount > 0) {
        if (!this.isAiCreating) {
          this.restorePartGenerationData()
          this.resetOnRenderEnd()
          this.$message.error('AI 续写结果不符合当前节点的结构规范，请重试')
        }
        return
      }
      partData.children = validation.children
      this.isLoopRendering = true
      this.addUid(partData)
      let lastPartData = JSON.stringify(partData)
      const treeData = this.addToTargetNode(partData.children || [])

      // 在当前渲染完成时再进行下一次渲染
      const onRenderEnd = () => {
        // 处理超出画布的节点
        this.checkNodeOuter()

        // 如果生成结束数据渲染完毕，那么解绑事件
        if (!this.isAiCreating && !this.aiCreatingContent) {
          this.mindMap.off('node_tree_render_end', onRenderEnd)
          this.latestUid = ''
          return
        }

        const partData = this.parseAiCreatingTree()
        if (!partData) {
          setTimeout(() => {
            onRenderEnd()
          }, 300)
          return
        }
        const validation = this.validateContinuationChildren(
          partData.children || []
        )
        if (!validation.children.length && validation.invalidCount > 0) {
          if (this.isAiCreating) {
            setTimeout(() => {
              onRenderEnd()
            }, 300)
          } else {
            this.mindMap.off('node_tree_render_end', onRenderEnd)
            this.restorePartGenerationData()
            this.resetOnRenderEnd()
            this.$message.error('AI 续写结果不符合当前节点的结构规范，请重试')
          }
          return
        }
        partData.children = validation.children
        this.addUid(partData)
        const treeData = this.addToTargetNode(partData.children || [])

        if (this.isAiCreating) {
          // 如果和上次数据一样则不触发重新渲染
          const curPartData = JSON.stringify(partData)
          if (curPartData === lastPartData) {
            setTimeout(() => {
              onRenderEnd()
            }, 500)
            return
          }
          lastPartData = curPartData
          this.mindMap.updateData(treeData)
        } else {
          this.mindMap.updateData(treeData)
          this.resetOnRenderEnd()
          this.$message.success(this.$t('ai.aiGenerationSuccess'))
        }
      }
      this.mindMap.on('node_tree_render_end', onRenderEnd)
      // 因为是续写，所以首次也直接使用updateData方法渲染
      this.mindMap.updateData(treeData)
    },

    // AI对话
    async aiChat(
      messageList = [],
      progress = () => {},
      end = () => {},
      err = () => {}
    ) {
      try {
        await this.aiTest()
        // 发起请求
        this.isAiCreating = true
        this.aiInstance = new Ai()
        this.aiInstance.request(
          {
            messages: messageList.map(msg => {
              return {
                role: 'user',
                content: msg
              }
            })
          },
          content => {
            progress(content)
          },
          content => {
            end(content)
          },
          error => {
            err(error)
          }
        )
      } catch (error) {
        console.log(error)
      }
    },

    // AI对话停止
    aiChatStop() {
      if (this.aiInstance) {
        this.aiInstance.stop()
        this.isAiCreating = false
        this.aiInstance = null
      }
    }
  }
}
</script>

<style lang="less" scoped>
.clientTipDialog,
.createDialog {
  /deep/ .el-dialog {
    max-width: calc(100vw - 32px);
  }

  /deep/ .el-dialog__body {
    padding: 12px 20px;
  }
}

.tipBox {
  p {
    margin-bottom: 12px;

    a {
      color: #409eff;
    }
  }
}

.inputBox {
  .documentSection {
    margin-bottom: 18px;
  }

  .documentHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .documentTitle,
  .promptLabel {
    color: #303133;
    font-size: 14px;
    font-weight: 600;
  }

  .documentSubtitle {
    margin-top: 3px;
    color: #909399;
    font-size: 12px;
  }

  .promptLabel {
    margin-bottom: 8px;
  }

  .documentList {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid #e4e7ed;
    border-radius: 4px;
  }

  .documentDirectory {
    display: flex;
    width: 100%;
    height: 36px;
    align-items: center;
    gap: 7px;
    box-sizing: border-box;
    padding-top: 0;
    padding-right: 12px;
    padding-bottom: 0;
    border: 0;
    border-bottom: 1px solid #ebeef5;
    color: #606266;
    background: transparent;
    text-align: left;
    cursor: pointer;

    &:hover {
      background: #f5f7fa;
    }
  }

  .documentProject {
    height: 40px;
  }

  .documentDirectorySpacer {
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
  }

  .documentProjectName {
    color: #303133;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .documentProjectCount {
    flex: 0 0 auto;
    color: #909399;
    font-size: 12px;
    margin-left: auto;
  }

  .documentEmpty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 64px;
    border: 1px dashed #dcdfe6;
    border-radius: 4px;
    color: #909399;
    font-size: 13px;

    i {
      margin-right: 6px;
    }
  }

  .documentItem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 36px;
    padding: 0 12px;
    border-bottom: 1px solid #ebeef5;
    cursor: pointer;
    box-sizing: border-box;

    &:last-child {
      border-bottom: 0;
    }

    &:hover {
      background: #f5f7fa;
    }

  }

  .documentName {
    display: inline-block;
    max-width: 330px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
    white-space: nowrap;
  }

  .documentMeta {
    flex: 0 0 auto;
    margin-left: 12px;
    color: #909399;
    font-size: 12px;
  }

  .linkedDocumentTag {
    display: inline-flex;
    align-items: center;
    height: 20px;
    margin-right: 8px;
    padding: 0 6px;
    border-radius: 3px;
    background: #ecf5ff;
    color: #409eff;
    font-size: 11px;
    line-height: 20px;
  }

  .tip {
    margin-top: 12px;

    &.warning {
      color: #f56c6c;
    }
  }
}

.createDialog.isDark {
  .inputBox {
    .documentTitle,
    .promptLabel {
      color: #e5e7eb;
    }

    .documentSubtitle,
    .documentMeta,
    .documentProjectCount,
    .documentEmpty {
      color: #a7abb2;
    }

    .documentList {
      border-color: #4c5159;
      background: #30343a;
    }

    .documentEmpty {
      border-color: #555b64;
      background: #30343a;
    }

    .documentItem {
      border-color: #454a52;

      &:hover {
        background: #3a3f46;
      }

    }

    .documentProjectName {
      color: #e5e7eb;
    }

    .linkedDocumentTag {
      background: rgba(64, 158, 255, 0.16);
      color: #79bbff;
    }

    .documentDirectory {
      border-color: #454a52;
      color: #d8dbe0;

      &:hover {
        background: #3a3f46;
      }
    }
  }

  /deep/ .el-checkbox__label {
    color: #d8dbe0;
  }

  /deep/ .el-textarea__inner {
    border-color: #555b64;
    background: #343940;
    color: #e5e7eb;

    &::placeholder {
      color: #989da5;
    }
  }

  /deep/ .el-input__count {
    background: transparent;
    color: #a7abb2;
  }
}

.aiCreatingMask {
  position: fixed;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  z-index: 99999;
  background-color: transparent;

  .creatingStatus {
    position: absolute;
    left: 50%;
    top: 116px;
    transform: translateX(-50%);
    width: 480px;
    max-width: calc(100vw - 32px);
    padding: 17px 18px 10px;
    overflow: hidden;
    border: 1px solid #dce4ed;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.98);
    color: #303133;
    box-shadow: 0 16px 34px rgba(31, 45, 61, 0.13),
      0 3px 8px rgba(31, 45, 61, 0.06);
    box-sizing: border-box;
    backdrop-filter: blur(10px);
  }

  .creatingHeader,
  .creatingIdentity,
  .generationActivity {
    display: flex;
    align-items: center;
  }

  .creatingHeader {
    justify-content: space-between;
    gap: 16px;
  }

  .creatingIdentity {
    min-width: 0;
    padding-left: 2px;
  }

  .creatingHeading {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;

    strong {
      overflow: hidden;
      color: #1f2937;
      font-size: 16px;
      font-weight: 600;
      line-height: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      color: #8a919e;
      font-size: 12px;
      line-height: 16px;
    }
  }

  .stopGeneratingButton {
    flex: 0 0 auto;
    height: 31px;
    padding: 0 11px;
    border-color: #d6dde6;
    border-radius: 5px;
    background: transparent;
    color: #606975;

    i {
      margin-right: 4px;
    }

    &:hover,
    &:focus {
      border-color: #e07171;
      background: #fff5f5;
      color: #c84f4f;
    }
  }

  .generationSteps {
    position: relative;
    display: grid;
    margin: 20px 2px 16px;
  }

  .stepTrack {
    position: absolute;
    top: 8px;
    height: 2px;
    overflow: hidden;
    border-radius: 2px;
    background: #e3e8ef;

    span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: #78a9db;
      transition: width 280ms ease;
    }
  }

  .generationStep {
    position: relative;
    display: flex;
    z-index: 1;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    color: #a1a8b2;
    font-size: 12px;

    &.done,
    &.active {
      color: #2d6fb5;
    }

    &.active .stepMarker {
      border-color: #2d6fb5;
      background: #fff;
      animation: activeStepPulse 1.6s ease-in-out infinite;

      &::after {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #2d6fb5;
        content: '';
        animation: activeStepDot 1.6s ease-in-out infinite;
      }
    }

    &.done .stepMarker {
      border-color: #78a9db;
      background: #78a9db;
      color: #fff;
    }
  }

  .stepMarker {
    position: relative;
    z-index: 1;
    display: inline-flex;
    flex: 0 0 18px;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1px solid #cbd1d9;
    border-radius: 50%;
    background: #fff;
    box-sizing: border-box;
    font-size: 10px;
  }

  .stepLabel {
    display: block;
    width: 100%;
    overflow: hidden;
    line-height: 18px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .generationActivity {
    min-height: 22px;
    padding-top: 13px;
    border-top: 1px solid #edf0f4;
    color: #68717d;
    font-size: 13px;
    line-height: 20px;
  }

  .activityDot {
    flex: 0 0 6px;
    width: 6px;
    height: 6px;
    margin: 0 9px 0 3px;
    border-radius: 50%;
    background: #2d6fb5;
    box-shadow: 0 0 0 3px rgba(45, 111, 181, 0.12);
  }

  .activityText {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nodeCount {
    flex: 0 0 auto;
    margin-left: 12px;
    color: #8a919e;
    font-size: 12px;
  }

  &.isDark {
    .creatingStatus {
      border-color: #464d56;
      background: rgba(38, 42, 47, 0.97);
      color: #e5e7eb;
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.34);
    }

    .creatingHeading strong {
      color: #f0f2f5;
    }

    .creatingHeading span,
    .nodeCount {
      color: #9299a3;
    }

    .stopGeneratingButton {
      border-color: #555c65;
      color: #c7cbd1;

      &:hover,
      &:focus {
        border-color: #b86565;
        background: #432f32;
        color: #eeaaaa;
      }
    }

    .stepTrack {
      background: #4a515a;

      span {
        background: #638fb9;
      }
    }

    .stepMarker {
      border-color: #606771;
      background: #262a2f;
    }

    .generationStep.done .stepMarker {
      border-color: #638fb9;
      background: #638fb9;
      color: #fff;
    }

    .generationStep.active .stepMarker {
      background: #262a2f;

      &::after {
        background: #70a9df;
      }
    }

    .generationActivity {
      border-color: #454b53;
      color: #c2c7ce;
    }
  }

  @media (max-width: 520px) {
    .creatingStatus {
      top: 96px;
      padding: 13px 14px 16px;
    }

    .generationSteps {
      margin-top: 15px;
    }

    .stepLabel {
      font-size: 11px;
    }

    .stopGeneratingButton span {
      display: none;
    }

    .stopGeneratingButton i {
      margin-right: 0;
    }
  }
}

@keyframes activeStepPulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(45, 111, 181, 0.08);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(45, 111, 181, 0.16);
  }
}

@keyframes activeStepDot {
  0%,
  100% {
    opacity: 0.65;
    transform: scale(0.8);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .aiCreatingMask {
    .generationStep.active .stepMarker,
    .generationStep.active .stepMarker::after {
      animation: none;
    }
  }
}
</style>
