// app.js
const auth = require('./utils/auth');

App({
  onLaunch() {
    // Perform login when the app launches
    auth.login()
      .then(res => {
        console.log('Login successful', res);
        // You can store user info globally if needed
        // this.globalData.userInfo = ...
      })
      .catch(err => {
        console.error('Login failed on launch', err);
      });
  }
});
