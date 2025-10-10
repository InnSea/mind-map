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
        if (this.$bus) {
          this.$bus.$emit('external_environment_ready', this.externalEnvironment);
        }
        
        console.log('外部环境已就绪:', this.externalEnvironment);
      } else {
        // 增加重试次数限制，避免无限重试
        if (!this.retryCount) {
          this.retryCount = 0;
        }
        
        if (this.retryCount < 50) { // 最多重试50次，约10秒
          this.retryCount++;
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 200);
        } else {
          console.warn('外部环境检测超时，可能iframe未正确加载');
        }
      }
    },

    isExternalMethodsReady() {
      return !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
    },

    // 提供统一的调用方法，返回Promise
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