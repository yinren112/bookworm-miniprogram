const THEME_COLORS = {
  light: {
    navFrontColor: "#000000",
    navBackgroundColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    backgroundColorTop: "#58CC02",
    backgroundColorBottom: "#FFFFFF",
    backgroundTextStyle: "dark",
  },
  dark: {
    navFrontColor: "#ffffff",
    navBackgroundColor: "#131F24",
    backgroundColor: "#131F24",
    backgroundColorTop: "#131F24",
    backgroundColorBottom: "#131F24",
    backgroundTextStyle: "light",
  },
};

function getSystemTheme() {
  try {
    const info = wx.getSystemInfoSync();
    return info && info.theme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(theme) {
  const activeTheme = theme === "dark" ? "dark" : "light";
  const colors = THEME_COLORS[activeTheme];

  try {
    if (wx.setNavigationBarColor) {
      wx.setNavigationBarColor({
        frontColor: colors.navFrontColor,
        backgroundColor: colors.navBackgroundColor,
        animation: { duration: 0, timingFunc: "linear" },
      });
    }
  } catch (err) {
    void err;
  }

  try {
    if (wx.setBackgroundColor) {
      wx.setBackgroundColor({
        backgroundColor: colors.backgroundColor,
        backgroundColorTop: colors.backgroundColorTop,
        backgroundColorBottom: colors.backgroundColorBottom,
      });
    }
  } catch (err) {
    void err;
  }

  try {
    if (wx.setBackgroundTextStyle) {
      wx.setBackgroundTextStyle({
        textStyle: colors.backgroundTextStyle,
      });
    }
  } catch (err) {
    void err;
  }

  return activeTheme;
}

function startThemeListener() {
  if (!wx.onThemeChange) return;
  wx.onThemeChange((res) => {
    applyTheme(res && res.theme ? res.theme : "light");
  });
}

module.exports = {
  applyTheme,
  getSystemTheme,
  startThemeListener,
};
