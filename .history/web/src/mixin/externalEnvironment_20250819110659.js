// web/src/mixins/externalEnvironment.js
export default {
    data() {
      return {
        externalEnvironment: {
          isReady: false,
          isPublic: false,
          methods: {
            activeSave: null,
            copyLink: null
          }
        }
      }
    },
  
    created() {
      // 在组件创建时就开始检查外部环境
      this.initExternalEnvironment();
    },
  
    methods: {
      initExternalEnvironment() {
        this.checkExternalEnvironment();
      },
  
      checkExternalEnvironment() {
        if (this.isExternalMethodsReady()) {
          this.externalEnvironment.isReady = true;
          this.externalEnvironment.isPublic = window.isPublic;
          this.externalEnvironment.methods.activeSave = window.activeSave;
          this.externalEnvironment.methods.copyLink = window.copyLink;
          
          // 触发全局事件，通知其他组件
          this.$bus.$emit('external_environment_ready', this.externalEnvironment);
        } else {
          // 延迟重试
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 100);
        }
      },
  
      isExternalMethodsReady() {
        return !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
      },
  
      // 提供统一的调用方法
      callExternalSave() {
        if (this.externalEnvironment.methods.activeSave) {
          return this.externalEnvironment.methods.activeSave();
        }
        return Promise.reject(new Error('外部保存方法不可用'));
      },
  
      callExternalCopyLink() {
        if (this.externalEnvironment.methods.copyLink) {
          return this.externalEnvironment.methods.copyLink();
        }
        throw new Error('外部复制链接方法不可用');
      }
    }
  }