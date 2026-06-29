const prisma = require("../prisma/client");

const defaultSettings = {
  appTheme: "system",
  appDensity: "comfortable",
  defaultFontSize: 19,
  defaultReaderTheme: "sepia",
  defaultReadingMode: "scroll",
  defaultAudioSpeed: "1",
  voiceProfile: "default",
  autoPlayNext: true,
  notifyRecommendations: true,
  notifyReleases: true,
  notifyStreaks: true,
  notifyPromotions: false,
  profileVisibility: "private",
  dataSharing: "limited",
};

async function getSettings(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.session.user.id) },
      select: { settings: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const userSettings = user.settings || {};
    const mergedSettings = { ...defaultSettings, ...userSettings };

    return res.json({
      success: true,
      data: mergedSettings,
    });
  } catch (error) {
    console.error("getSettings error:", error);
    return res.status(500).json({ success: false, error: "Unable to fetch settings" });
  }
}

async function patchSettings(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.session.user.id) },
      select: { settings: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const currentSettings = user.settings || {};
    const updatedSettings = { ...currentSettings, ...req.body };

    const updated = await prisma.user.update({
      where: { id: String(req.session.user.id) },
      data: { settings: updatedSettings },
      select: { settings: true },
    });

    const mergedSettings = { ...defaultSettings, ...updated.settings };

    return res.json({
      success: true,
      message: "Settings updated successfully",
      data: mergedSettings,
    });
  } catch (error) {
    console.error("patchSettings error:", error);
    return res.status(500).json({ success: false, error: "Unable to update settings" });
  }
}

module.exports = {
  getSettings,
  patchSettings,
};
