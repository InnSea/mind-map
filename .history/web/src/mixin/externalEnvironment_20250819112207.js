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
    console.log('ExternalEnvironment混入已加载到组件:', this.$options.name || '未知组件');
    this.initExternalEnvironment();
  },

  methods: {
    initExternalEnvironment() {
      console.log('开始初始化外部环境...');
      this.checkExternalEnvironment();
    },

    checkExternalEnvironment() {
      console.log('检查外部环境...');
      console.log('window.activeSave:', window.activeSave);
      console.log('window.copyLink:', window.copyLink);
      console.log('window.isPublic:', window.isPublic);
      
      if (this.isExternalMethodsReady()) {
        console.log('外部环境检测成功！');
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
          console.log(`外部环境检测失败，第${this.retryCount}次重试...`);
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 200);
        } else {
          console.warn('外部环境检测超时，可能iframe未正确加载');
          console.warn('当前window对象状态:', {
            activeSave: window.activeSave,
            copyLink: window.copyLink,
            isPublic: window.isPublic
          });
        }
      }
    },

    isExternalMethodsReady() {
      const ready = !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
      console.log('外部方法就绪状态:', ready);
      return ready;
    },

    // 提供统一的调用方法，返回Promise
    callExternalSave() {
      console.log('调用外部保存方法...');
      if (this.externalEnvironment.methods.activeSave) {
        return this.externalEnvironment.methods.activeSave();
      }
      return Promise.reject(new Error('外部保存方法不可用'));
    },

    callExternalCopyLink() {
      console.log('调用外部复制链接方法...');
      if (this.externalEnvironment.methods.copyLink) {
        return this.externalEnvironment.methods.copyLink();
      }
      throw new Error('外部复制链接方法不可用');
    }
  }
}