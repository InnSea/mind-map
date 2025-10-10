// 图片上传相关 API
import axios from 'axios'

// 上传图片到服务器
export const uploadImage = async (file) => {
  const formData = new FormData()
  formData.append('file', file)
  
  try {
    const response = await axios.post('http://127.0.0.1:7788/api/mindmap/img', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    
    if (response.data.code === 200) {
      return response.data.data
    } else {
      throw new Error(response.data.message || '上传失败')
    }
  } catch (error) {
    console.error('图片上传失败:', error)
    throw error
  }
}
