using MediaBrowser.Model.Plugins;

namespace SonnyTel.Plugin.BackdropExtended;

/// <summary>
/// Plugin configuration for Backdrop Extended.
/// </summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Gets or sets a value indicating whether homepage backdrops are limited to PG-13 or lower.
    /// When false, backdrops from all content are shown regardless of rating.
    /// </summary>
    public bool MaxRatingEnabled { get; set; } = true;
}
