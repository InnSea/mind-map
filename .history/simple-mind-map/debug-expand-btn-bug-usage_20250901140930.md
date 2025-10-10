# 展开收起按钮位置Bug调试工具使用说明

## 概述

这个调试工具专门用于触发和检测思维导图中展开收起按钮位置更新的bug。通过模拟快速添加和删除节点的操作，可以重现按钮位置不正确的问题。

## 文件说明

- `debug-expand-btn-bug.js` - 主要的调试工具脚本
- `debug-expand-btn-bug-usage.md` - 本使用说明文档

## 使用方法

### 1. 在浏览器中使用

#### 步骤1：加载调试脚本

在浏览器中打开思维导图应用，然后在开发者工具的控制台中执行以下代码：

```javascript
// 方法1：直接复制粘贴debug-expand-btn-bug.js的内容到控制台

// 方法2：如果文件已经加载到页面中
// <script src="debug-expand-btn-bug.js"></script>
```

#### 步骤2：获取思维导图实例

```javascript
// 假设你的思维导图实例变量名为 mindMap
// 如果不确定变量名，可以查看页面的JavaScript代码
const mindMap = window.mindMap; // 或者其他实例名称
```

#### 步骤3：运行调试函数

```javascript
// 单次测试
window.debugExpandBtnBug.triggerExpandBtnBug(mindMap);

// 自动化测试（推荐）
window.debugExpandBtnBug.autoTestExpandBtnBug(mindMap, 3);

// 手动检查特定节点的按钮位置
const targetNode = mindMap.renderer.root.children[0];
window.debugExpandBtnBug.checkExpandBtnPosition(targetNode);
```

### 2. 在Node.js环境中使用

```javascript
const debugTool = require('./debug-expand-btn-bug.js');

// 使用方法同上
debugTool.triggerExpandBtnBug(mindMap);
debugTool.autoTestExpandBtnBug(mindMap, 5);
```

## 函数说明

### triggerExpandBtnBug(mindMap)

触发展开收起按钮位置bug的主要函数。

**参数：**
- `mindMap` - 思维导图实例

**功能：**
1. 为根节点的第一个子节点添加子节点
2. 快速连续添加多个子节点
3. 快速删除部分子节点
4. 再次添加新节点
5. 自动检查按钮位置是否正确

### autoTestExpandBtnBug(mindMap, iterations)

自动化测试函数，可以连续多轮执行bug触发流程。

**参数：**
- `mindMap` - 思维导图实例
- `iterations` - 测试轮数，默认为3

### checkExpandBtnPosition(node)

检查指定节点的展开收起按钮位置是否正确。

**参数：**
- `node` - 要检查的节点实例

**输出：**
- 节点的尺寸信息
- 按钮的当前位置
- 按钮的期望位置
- 位置是否正确的判断结果

## 预期结果

### 正常情况

如果展开收起按钮位置正确，控制台会显示：

```
✅ 展开收起按钮位置正确
```

### Bug触发情况

如果成功触发了bug，控制台会显示：

```
❌ 展开收起按钮位置异常！
期望位置： { x: 120, y: 15 }
实际位置： { x: 80, y: 15 }
```

## 支持的布局类型

目前支持检测以下布局类型的按钮位置：

- `logicalStructure` - 逻辑结构图
- `mindMap` - 思维导图
- `organizationStructure` - 组织结构图

## 注意事项

1. **确保思维导图已初始化**：在运行调试代码之前，确保思维导图实例已经正确初始化。

2. **观察控制台输出**：调试过程中会在控制台输出详细的步骤信息和检测结果。

3. **多次测试**：建议运行多轮自动化测试，因为bug可能不是每次都能触发。

4. **不同布局测试**：在不同的布局模式下测试，因为不同布局的按钮位置计算逻辑可能不同。

5. **清理测试数据**：测试完成后，可能需要手动清理添加的测试节点。

## 故障排除

### 问题1："请先初始化思维导图实例"错误

**解决方案：**
- 检查思维导图实例是否正确传入
- 确认实例的`renderer`属性存在

### 问题2："未找到根节点"错误

**解决方案：**
- 确保思维导图已经渲染完成
- 检查是否有数据加载到思维导图中

### 问题3：无法触发bug

**解决方案：**
- 尝试增加测试轮数
- 在不同的浏览器中测试
- 检查思维导图的版本和配置

## 与修复方案的配合使用

这个调试工具可以与之前讨论的修复方案配合使用：

1. **修复前测试**：使用调试工具确认bug存在
2. **应用修复**：实施修复方案（如在`MindMapNode.js`中添加延迟刷新逻辑）
3. **修复后验证**：再次运行调试工具，确认bug已修复

## 扩展功能

可以根据需要扩展调试工具的功能：

- 添加更多的节点操作场景
- 支持更多布局类型的位置检测
- 添加性能监控功能
- 集成到自动化测试框架中