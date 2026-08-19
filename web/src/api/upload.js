import { platformRequest } from '@/api/platformClient'

const uploadFile = async (file, type = '文件') => {
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await platformRequest('/api/oss/mindmap/upload', {
      method: 'POST',
      body: formData
    })
    return response.data
  } catch (error) {
    console.error(`${type}上传失败:`, error)
    throw error
  }
}

export const uploadImage = async file => {
  return await uploadFile(file, '图片')
}

export const uploadVideo = async file => {
  return await uploadFile(file, '视频')
}
