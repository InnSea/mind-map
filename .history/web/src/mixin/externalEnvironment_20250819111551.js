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
          
          this.$bus.$emit('external_environment_ready', this.externalEnvironment);
        } else {
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 100);
        }
      },
  
      isExternalMethodsReady() {
        return !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
      },
  
      callExternalSave() {
        if (this.externalEnvironment.methods.activeSave) {
          return this.externalEnvironment.methods.activeSave();
        }
        return Promise.reject(new Warb('外部保存方法不可用'));
      },
  
      callExternalCopyLink() {
        if (this.externalEnvironment.methods.copyLink) {
          return this.externalEnvironment.methods.copyLink();
        }
        throw new Error('外部复制链接方法不可用');
      }
    }
  }