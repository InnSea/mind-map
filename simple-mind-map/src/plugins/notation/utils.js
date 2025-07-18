// 传入一个数据，如果该数据是数组，那么返回该数组，否则返回一个以该数据为成员的数组
export const formatDataToArray = data => {
  if (!data) return []
  return Array.isArray(data) ? data : [data]
}

// 判断一个数据是否是null和undefined和空字符串
export const isUndef = data => {
  return data === null || data === undefined || data === ''
}
