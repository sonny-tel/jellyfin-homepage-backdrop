using System;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Serialization;

namespace SonnyTel.Plugin.MusicPlayerFixes;

/// <summary>
/// Music Player Fixes plugin.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>
{
    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="xmlSerializer">Instance of the <see cref="IXmlSerializer"/> interface.</param>
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    /// <summary>
    /// Gets the current plugin instance.
    /// </summary>
    public static Plugin? Instance { get; private set; }

    /// <inheritdoc />
    public override string Name => "Music Player Fixes";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("a5d1e2f3-b4c6-4d7e-8f9a-0b1c2d3e4f5a");

    /// <inheritdoc />
    public override string Description => "Fixes and improvements for the Jellyfin music player.";
}
