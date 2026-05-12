import axios from 'axios'

const uploadFile = async (file, type = '文件') => {
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await axios.post(
      'https://test.classtorch.com/api/oss/mindmap/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )

    if (response.data.code === 0) {
      return response.data.data
    } else {
      throw new Error(response.data.msg || response.data.message || '上传失败')
    }
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
