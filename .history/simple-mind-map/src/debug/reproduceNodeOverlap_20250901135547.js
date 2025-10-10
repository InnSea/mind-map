/**
 * 节点重叠问题复现工具
 * 
 * 这个文件提供了多种方法来复现节点重叠问题，
 * 通过模拟渲染时序问题、DOM尺寸计算错误等方式。
 */

// 全局开关，控制是否启用复现逻辑
let ENABLE_REPRODUCTION = false;

/**
 * 启用节点重叠问题复现
 * @param {Object} mindMap - 思维导图实例
 * @param {Object} options - 配置选项
 */
export function enableNodeOverlapReproduction(mindMap, options = {}) {
  ENABLE_REPRODUCTION = true;
  
  const {
    renderDelayProbability = 0.3,  // 渲染延迟概率
    sizeErrorProbability = 0.2,    // 尺寸错误概率
    maxRenderDelay = 20,           // 最大渲染延迟(ms)
    sizeErrorRange = [0.7, 0.9]    // 尺寸错误范围
  } = options;
  
  console.log('🐛 已启用节点重叠问题复现模式');
  console.log('配置:', { renderDelayProbability, sizeErrorProbability, maxRenderDelay, sizeErrorRange });
  
  // 方法1: 模拟渲染延迟
  if (mindMap.renderer && mindMap.renderer._render) {
    const originalRender = mindMap.renderer._render;
    mindMap.renderer._render = function() {
      if (ENABLE_REPRODUCTION && Math.random() < renderDelayProbability) {
        console.log('🐛 触发渲染延迟模拟');
        setTimeout(() => {
          originalRender.call(this);
        }, Math.random() * maxRenderDelay);
        return;
      }
      originalRender.call(this);
    };
  }
  
  // 方法2: 模拟DOM尺寸计算错误
  const originalGetNodeRect = mindMap.renderer.root.constructor.prototype.getNodeRect;
  mindMap.renderer.root.constructor.prototype.getNodeRect = function() {
    const result = originalGetNodeRect.call(this);
    
    if (ENABLE_REPRODUCTION && 
        Math.random() < sizeErrorProbability && 
        this.children && 
        this.children.length > 0) {
      console.log('🐛 触发尺寸计算错误模拟');
      const [minRatio, maxRatio] = sizeErrorRange;
      return {
        width: result.width * (minRatio + Math.random() * (maxRatio - minRatio)),
        height: result.height * (minRatio + Math.random() * (maxRatio - minRatio))
      };
    }
    
    return result;
  };
  
  // 方法3: 模拟布局计算时序错误
  if (mindMap.layout && mindMap.layout.computedBaseValue) {
    const originalComputedBaseValue = mindMap.layout.computedBaseValue;
    mindMap.layout.computedBaseValue = function() {
      if (ENABLE_REPRODUCTION && Math.random() < 0.1) {
        console.log('🐛 触发布局计算延迟模拟');
        setTimeout(() => {
          originalComputedBaseValue.call(this);
        }, Math.random() * 10);
        return;
      }
      originalComputedBaseValue.call(this);
    };
  }
}

/**
 * 禁用节点重叠问题复现
 */
export function disableNodeOverlapReproduction() {
  ENABLE_REPRODUCTION = false;
  console.log('✅ 已禁用节点重叠问题复现模式');
}

/**
 * 手动触发并发渲染冲突
 * @param {Object} mindMap - 思维导图实例
 */
export function triggerConcurrentRenderingConflict(mindMap) {
  const nodes = mindMap.renderer.getAllNodes();
  const expandableNodes = nodes.filter(node => 
    node.children && node.children.length > 0 && !node.getData('expand')
  );
  
  if (expandableNodes.length >= 2) {
    console.log('🐛 触发并发渲染冲突');
    
    // 几乎同时展开多个节点
    expandableNodes[0].setData({ expand: true });
    setTimeout(() => {
      expandableNodes[1].setData({ expand: true });
      mindMap.render();
    }, 1);
    
    setTimeout(() => {
      mindMap.render();
    }, 5);
    
    return true;
  } else {
    console.warn('⚠️ 没有足够的可展开节点来触发并发渲染冲突');
    return false;
  }
}

/**
 * 快速展开/收起操作，模拟用户快速操作
 * @param {Object} mindMap - 思维导图实例
 * @param {number} count - 操作次数
 */
export function rapidExpandCollapseOperations(mindMap, count = 5) {
  const nodes = mindMap.renderer.getAllNodes();
  const operableNodes = nodes.filter(node => 
    node.children && node.children.length > 0
  );
  
  if (operableNodes.length === 0) {
    console.warn('⚠️ 没有可操作的节点');
    return;
  }
  
  console.log(`🐛 开始快速展开/收起操作 ${count} 次`);
  
  let operationCount = 0;
  const interval = setInterval(() => {
    if (operationCount >= count) {
      clearInterval(interval);
      console.log('✅ 快速操作完成');
      return;
    }
    
    const randomNode = operableNodes[Math.floor(Math.random() * operableNodes.length)];
    const currentExpand = randomNode.getData('expand');
    randomNode.setData({ expand: !currentExpand });
    mindMap.render();
    
    operationCount++;
  }, 50); // 每50ms一次操作
}

/**
 * 获取当前复现状态
 */
export function getReproductionStatus() {
  return {
    enabled: ENABLE_REPRODUCTION,
    timestamp: new Date().toISOString()
  };
}

// 在浏览器环境中暴露到全局对象
if (typeof window !== 'undefined') {
  window.reproduceNodeOverlap = {
    enable: enableNodeOverlapReproduction,
    disable: disableNodeOverlapReproduction,
    triggerConflict: triggerConcurrentRenderingConflict,
    rapidOperations: rapidExpandCollapseOperations,
    getStatus: getReproductionStatus
  };
  
  console.log('🔧 节点重叠复现工具已加载到 window.reproduceNodeOverlap');
}