// middleware/signatureValidator.js
const crypto = require('crypto');
const qs = require('querystring');

module.exports = () => {
  return async (req, res, next) => {
    // if (process.env.NODE_ENV === 'production') return next();
    
    try {
      const { apiSecret } = req.app.get('binanceConfig');
      
      // 优先使用服务端生成的签名参数
      const params = res.locals.signatureParams 
        ? res.locals.signatureParams 
        : { ...req.query, ...req.body, ...req.params };

      // 生成规范化的查询字符串
      const orderedParams = qs.stringify(params, {
        sort: true,
        encode: true,
        strict: true
      });
      
      // 重新生成签名
      const recreatedSign = crypto
        .createHmac('sha256', apiSecret)
        .update(orderedParams)
        .digest('hex');
      
      // 调试输出
      console.log('\n===== Signature Debug =====');
      console.log('Used Parameters:', params);
      console.log('Ordered String:', orderedParams);
      console.log('Regenerated Signature:', recreatedSign);
      
      // 验证签名（从响应头获取实际签名）
      const actualSign = res.get('X-MBX-SIGNATURE');
      if (actualSign && actualSign !== recreatedSign) {
        console.warn(`[WARNING] 签名不匹配\n实际签名: ${actualSign}\n生成签名: ${recreatedSign}`);
      }
      
      next();
    } catch (e) {
      console.error('签名验证中间件错误:', e);
      next();
    }
  };
};
