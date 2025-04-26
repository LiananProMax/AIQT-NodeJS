const crypto = require('crypto');

module.exports = {
  generateSignature(queryString, apiSecret) {
    return crypto
      .createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');
  }
};
