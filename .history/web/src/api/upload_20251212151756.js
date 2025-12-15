import axios from 'axios'

export const uploadImage = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  try {
    const response = await axios.post('api/oss/mindmap/img', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    if (response.data.code === 0) {
      return response.data.data
    } else {
      throw new Error(response.data.msg || response.data.message || '上传失败')
    }
  } catch (error) {
    console.error('图片上传失败:', error)
    throw error
  }
}
