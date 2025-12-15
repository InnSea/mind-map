export default {
    data() {
      return {
        externalEnvironment: {
          isReady: false,
          isPublic: false,
          methods: {
            activeSave: null,
            copyLink: null
          },
          cooperateConfig: null
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
          this.externalEnvironment.cooperateConfig = window.cooperateConfig || null;
          
          this.$bus.$emit('external_environment_ready', this.externalEnvironment);
        } else {
          setTimeout(() => {
            this.checkExternalEnvironment();
          }, 200);
        }
      },
  
      isExternalMethodsReady() {
        return !!(window.activeSave && window.copyLink && window.isPublic !== undefined);
      },
  
      callExternalSave() {
        if (this.externalEnvironment.methods.activeSave) {
          return this.externalEnvironment.methods.activeSave();
        }
      },
  
      callExternalCopyLink() {
        if (this.externalEnvironment.methods.copyLink) {
          return this.externalEnvironment.methods.copyLink();
        }
      },

      getCooperateConfig() {
        return this.externalEnvironment.cooperateConfig;
      },

      setCooperateConfig(config) {
        this.externalEnvironment.cooperateConfig = config;
        if (window.cooperateConfig !== undefined) {
          window.cooperateConfig = config;
        }
        this.$bus.$emit('cooperate_config_changed', config);
      }
    }
  }