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
      :title="$t('ai.createMindMapTitle')"
      :visible.sync="createDialogVisible"
      width="450px"
      append-to-body
    >
      <div class="inputBox">
        <el-input
          type="textarea"
          :rows="5"
          :placeholder="$t('ai.createTip')"
          v-model="aiInput"
        >
        </el-input>
        <div class="tip warning">
          {{ $t('ai.importantTip') }}
        </div>
        <!-- <div class="tip">
          {{ $t('ai.wantModifyAiConfigTip')
          }}<el-button size="small" @click="showAiConfigDialog">{{
            $t('ai.modifyAIConfiguration')
          }}</el-button>
        </div> -->
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
      ref="aiCreatingMaskRef"
      v-show="aiCreatingMaskVisible"
    >
      <el-button type="warning" class="btn" @click="stopCreate">{{
        $t('ai.stopGenerating')
      }}</el-button>
    </div>
    <AiConfigDialog v-model="aiConfigDialogVisible"></AiConfigDialog>
    <!-- AI续写 -->
    <el-dialog
      class="createDialog"
      :title="$t('ai.aiCreatePart')"
      :visible.sync="createPartDialogVisible"
      width="450px"
      append-to-body
    >
      <div class="inputBox">
        <el-input type="textarea" :rows="5" v-model="aiPartInput"> </el-input>
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
import { mapState } from 'vuex'
import AiConfigDialog from './AiConfigDialog.vue'

export default {
  components: {
    AiConfigDialog
  },
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
      aiConfigDialogVisible: false,

      mindMapDataCache: '',
      beingAiCreateNodeUid: '',

      createPartDialogVisible: false,
      aiPartInput: '',
      beingCreatePartNode: null
    }
  },
  computed: {
    ...mapState(['aiConfig'])
  },
  created() {
    this.$bus.$on('ai_create_all', this.aiCrateAll)
    this.$bus.$on('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$on('ai_chat', this.aiChat)
    this.$bus.$on('ai_chat_stop', this.aiChatStop)
    this.$bus.$on('showAiConfigDialog', this.showAiConfigDialog)
  },
  mounted() {
    document.body.appendChild(this.$refs.aiCreatingMaskRef)
  },
  beforeDestroy() {
    this.$bus.$off('ai_create_all', this.aiCrateAll)
    this.$bus.$off('ai_create_part', this.showAiCreatePartDialog)
    this.$bus.$off('ai_chat', this.aiChat)
    this.$bus.$off('ai_chat_stop', this.aiChatStop)
    this.$bus.$off('showAiConfigDialog', this.showAiConfigDialog)
  },
  methods: {
    // 显示AI配置修改弹窗
    showAiConfigDialog() {
      this.aiConfigDialogVisible = true
    },

    // 客户端连接检测
    async testConnect() {
      try {
        await fetch(`http://test.classtorch.com/ai/test`, {
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
      // 检查配置
      if (
        !(
          this.aiConfig.api &&
          this.aiConfig.key &&
          this.aiConfig.model &&
          this.aiConfig.port
        )
      ) {
        this.showAiConfigDialog()
        throw new Error(this.$t('ai.configurationMissing'))
      }
      // 检查连接
      let isConnect = false
      try {
        await fetch(`http://test.classtorch.com/ai/test`, {
          method: 'GET',
          timeout: 60000
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
    },

    // 确认生成
    doAiCreate() {
      const aiInputText = this.aiInput.trim()
      if (!aiInputText) {
        this.$message.warning(this.$t('ai.noInputTip'))
        return
      }
      this.closeAiCreateDialog()
      this.aiCreatingMaskVisible = true
      // 发起请求
      this.isAiCreating = true
      this.aiInstance = new Ai({
        port: this.aiConfig.port
      })
      this.aiInstance.init('huoshan', this.aiConfig)
      this.mindMap.renderer.setRootNodeCenter()
      this.mindMap.setData(null)
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
          try {
            if (content) {
              const arr = content.split(/\n+/)
              let cleanContent = arr.splice(0, arr.length - 1).join('\n')

              // 清理可能影响解析的代码块标记
              cleanContent = cleanContent
                .replace(/```markdown\s*/g, '') // 移除markdown代码块开始标记
                .replace(/```\s*$/g, '') // 移除代码块结束标记
                .trim()

              this.aiCreatingContent = cleanContent
            }
            this.loopRenderOnAiCreating()
          } catch (renderError) {
            console.warn('AI生成渲染过程出错，但继续尝试:', renderError)
          }
        },
        content => {
          this.aiCreatingContent = content
          this.resetOnAiCreatingStop()
        },
        error => {
          console.error('AI整体生成网络错误:', error)
          this.resetOnAiCreatingStop()
          this.resetOnRenderEnd()

          // 区分不同类型的错误
          if (error && error.name === 'AbortError') {
            this.$message.info(this.$t('ai.generationStopped'))
          } else if (error && error.message && error.message.includes('网络')) {
            this.$message.error(this.$t('ai.networkError'))
          } else {
            this.$message.error(this.$t('ai.generationFailed'))
          }
        }
      )
    },

    // AI请求完成或出错后需要复位的数据
    resetOnAiCreatingStop() {
      this.aiCreatingMaskVisible = false
      this.isAiCreating = false
      this.aiInstance = null
    },

    // 渲染结束后需要复位的数据
    resetOnRenderEnd() {
      this.isLoopRendering = false
      this.uidMap = {}
      this.aiCreatingContent = ''
      this.mindMapDataCache = ''
      this.beingAiCreateNodeUid = ''
    },

    // 停止生成
    stopCreate() {
      this.aiInstance.stop()
      this.isAiCreating = false
      this.aiCreatingMaskVisible = false
      this.$message.success(this.$t('ai.stoppedGenerating'))
    },

    // 轮询进行渲染
    loopRenderOnAiCreating() {
      if (!this.aiCreatingContent.trim() || this.isLoopRendering) return
      this.isLoopRendering = true

      try {
        // 验证AI生成的内容是否有效
        if (
          !this.aiCreatingContent ||
          typeof this.aiCreatingContent !== 'string'
        ) {
          console.warn('AI生成内容无效，跳过渲染', this.aiCreatingContent)
          this.isLoopRendering = false
          return
        }

        const treeData = transformMarkdownTo(this.aiCreatingContent)
        // 验证解析后的数据是否有效
        if (!treeData || typeof treeData !== 'object') {
          console.warn('Markdown解析结果无效，跳过渲染', treeData)
          this.isLoopRendering = false
          return
        }

        this.addUid(treeData)
        let lastTreeData = JSON.stringify(treeData)

        // 在当前渲染完成时再进行下一次渲染
        const onRenderEnd = () => {
          try {
            // 处理超出画布的节点
            this.checkNodeOuter()

            // 如果生成结束数据渲染完毕，那么解绑事件
            if (!this.isAiCreating && !this.aiCreatingContent) {
              this.mindMap.off('node_tree_render_end', onRenderEnd)
              this.latestUid = ''
              return
            }

            // 验证内容有效性
            if (
              !this.aiCreatingContent ||
              typeof this.aiCreatingContent !== 'string'
            ) {
              setTimeout(() => {
                onRenderEnd()
              }, 500)
              return
            }

            const treeData = transformMarkdownTo(this.aiCreatingContent)
            // 验证解析结果有效性
            if (!treeData || typeof treeData !== 'object') {
              setTimeout(() => {
                onRenderEnd()
              }, 500)
              return
            }

            this.addUid(treeData)
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
              this.mindMap.updateData(treeData)
              this.resetOnRenderEnd()
              this.$message.success(this.$t('ai.aiGenerationSuccess'))
            }
          } catch (renderError) {
            console.warn('整体渲染过程中出现错误，跳过此次渲染:', renderError)
            setTimeout(() => {
              onRenderEnd()
            }, 1000)
          }
        }
        this.mindMap.on('node_tree_render_end', onRenderEnd)
        this.mindMap.setData(treeData)
      } catch (error) {
        console.error('整体初始化渲染过程出错:', error)
        this.isLoopRendering = false
        throw error
      }
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
      if (!data || typeof data !== 'object') {
        console.warn('addUid: 传入的数据无效', data)
        return
      }

      const checkRepeatUidMap = {}
      const walk = (node, pUid = '') => {
        // 增加节点验证，防止处理无效节点
        if (!node || typeof node !== 'object') {
          console.warn('addUid walk: 节点无效，跳过处理', node)
          return
        }

        if (!node.data) {
          node.data = {}
        }
        if (isUndef(node.data.uid)) {
          const nodeText = node.data.text || ''
          const key = pUid + '-' + nodeText
          node.data.uid = this.uidMap[key] || createUid()
          if (checkRepeatUidMap[node.data.uid]) {
            node.data.uid = createUid()
          }
          this.latestUid = this.uidMap[key] = node.data.uid
          checkRepeatUidMap[node.data.uid] = true
        }
        if (
          node.children &&
          Array.isArray(node.children) &&
          node.children.length > 0
        ) {
          node.children.forEach(child => {
            // 过滤掉无效的子节点
            if (child && typeof child === 'object') {
              walk(child, node.data.uid)
            }
          })
        }
      }
      walk(data)
    },

    // 显示AI续写弹窗
    showAiCreatePartDialog(node) {
      this.beingCreatePartNode = node
      const currentMindMapData = this.mindMap.getData()
      // 填充默认内容
      this.aiPartInput = `${this.$t(
        'ai.aiCreatePartMsgPrefix'
      )}${getStrWithBrFromHtml(currentMindMapData.data.text)}${this.$t(
        'ai.aiCreatePartMsgCenter'
      )}${getStrWithBrFromHtml(node.getData('text'))}${this.$t(
        'ai.aiCreatePartMsgPostfix'
      )}`
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
      if (!this.aiPartInput.trim()) return
      this.closeAiCreatePartDialog()
      this.aiCreatePart()
    },

    // AI生成部分
    async aiCreatePart() {
      try {
        if (!this.beingCreatePartNode) {
          return
        }
        await this.aiTest()
        this.beingAiCreateNodeUid = this.beingCreatePartNode.getData('uid')
        const currentMindMapData = this.mindMap.getData()
        this.mindMapDataCache = JSON.stringify(currentMindMapData)
        this.aiCreatingMaskVisible = true
        // 发起请求
        this.isAiCreating = true
        this.aiInstance = new Ai({
          port: this.aiConfig.port
        })
        this.aiInstance.init('huoshan', this.aiConfig)

        // 添加渲染错误计数
        let renderErrorCount = 0
        const maxRenderErrors = 3

        this.aiInstance.request(
          {
            messages: [
              {
                role: 'user',
                content:
                  this.aiPartInput.trim() + this.$t('ai.aiCreatePartMsgHelp')
              }
            ]
          },
          content => {
            try {
              if (content) {
                const arr = content.split(/\n+/)
                let cleanContent = arr.splice(0, arr.length - 1).join('\n')

                // 清理可能影响解析的代码块标记
                cleanContent = cleanContent
                  .replace(/```markdown\s*/g, '')
                  .replace(/```\s*$/g, '')
                  .trim()

                this.aiCreatingContent = cleanContent
              }
              this.loopRenderOnAiCreatingPart()
            } catch (renderError) {
              console.warn('渲染过程出错，但继续尝试:', renderError)
              renderErrorCount++

              // 如果渲染错误次数太多，才认为是真正的失败
              if (renderErrorCount >= maxRenderErrors) {
                console.error('渲染错误次数过多，停止生成')
                this.aiInstance.stop()
                this.resetOnAiCreatingStop()
                this.resetAiCreatePartDialog()
                this.resetOnRenderEnd()
                this.$message.error(this.$t('ai.renderingErrorTooMany'))
              }
            }
          },
          content => {
            this.aiCreatingContent = content
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
          },
          error => {
            console.error('AI生成网络错误:', error)
            this.resetOnAiCreatingStop()
            this.resetAiCreatePartDialog()
            this.resetOnRenderEnd()

            // 区分不同类型的错误
            if (error && error.name === 'AbortError') {
              this.$message.info(this.$t('ai.generationStopped'))
            } else if (
              error &&
              error.message &&
              error.message.includes('网络')
            ) {
              this.$message.error(this.$t('ai.networkError'))
            } else {
              this.$message.error(this.$t('ai.generationFailed'))
            }
          }
        )
      } catch (error) {
        console.log(error)
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
      this.isLoopRendering = true

      try {
        // 验证AI生成的内容是否有效
        if (
          !this.aiCreatingContent ||
          typeof this.aiCreatingContent !== 'string'
        ) {
          console.warn('AI续写内容无效，跳过渲染', this.aiCreatingContent)
          this.isLoopRendering = false
          return
        }

        const partData = transformMarkdownTo(this.aiCreatingContent)
        // 验证解析后的数据是否有效
        if (!partData || typeof partData !== 'object') {
          this.isLoopRendering = false
          return
        }

        this.addUid(partData)
        let lastPartData = JSON.stringify(partData)
        const treeData = this.addToTargetNode(partData.children || [])

        // 在当前渲染完成时再进行下一次渲染
        const onRenderEnd = () => {
          try {
            // 处理超出画布的节点
            this.checkNodeOuter()

            // 如果生成结束数据渲染完毕，那么解绑事件
            if (!this.isAiCreating && !this.aiCreatingContent) {
              this.mindMap.off('node_tree_render_end', onRenderEnd)
              this.latestUid = ''
              return
            }

            // 验证内容有效性
            if (
              !this.aiCreatingContent ||
              typeof this.aiCreatingContent !== 'string'
            ) {
              setTimeout(() => {
                onRenderEnd()
              }, 500)
              return
            }

            const partData = transformMarkdownTo(this.aiCreatingContent)
            // 验证解析结果有效性
            if (!partData || typeof partData !== 'object') {
              setTimeout(() => {
                onRenderEnd()
              }, 500)
              return
            }

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
          } catch (renderError) {
            // 继续下一次渲染尝试
            setTimeout(() => {
              onRenderEnd()
            }, 1000)
          }
        }
        this.mindMap.on('node_tree_render_end', onRenderEnd)
        this.mindMap.updateData(treeData)
      } catch (error) {
        console.error('初始化渲染过程出错:', error)
        this.isLoopRendering = false
        throw error
      }
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
        this.aiInstance = new Ai({
          port: this.aiConfig.port
        })
        this.aiInstance.init('huoshan', this.aiConfig)
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
  .tip {
    margin-top: 12px;

    &.warning {
      color: #f56c6c;
    }
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

  .btn {
    position: absolute;
    left: 50%;
    top: 100px;
    transform: translateX(-50%);
  }
}
</style>
