<template>
  <viewer :images="images">
    <img v-for="src in images" :key="src" :src="src" />
  </viewer>
</template>

<script>
export default {
  props: {
    mindMap: {
      type: Object,
      default() {
        return null
      }
    }
  },
  data() {
    return {
      images: []
    }
  },
  mounted() {
    this.mindMap.on('node_img_dblclick', this.onNodeTmgDblclick)
    this.mindMap.on('remote_show_image', this.onRemoteShowImage)
  },
  beforeDestroy() {
    this.mindMap.off('node_img_dblclick', this.onNodeTmgDblclick)
    this.mindMap.off('remote_show_image', this.onRemoteShowImage)
  },
  methods: {
    onNodeTmgDblclick(node, e) {
      e.stopPropagation()
      e.preventDefault()
      this.images = [node.getImageUrl()]
      this.$viewerApi({
        images: this.images
      })
    },
    onRemoteShowImage(url) {
      this.$viewerApi({ images: [url] })
    }
  }
}
</script>

<style></style>
