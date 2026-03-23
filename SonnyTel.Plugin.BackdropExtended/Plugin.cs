using System;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace SonnyTel.Plugin.BackdropExtended;

/// <summary>
/// Backdrop Extended plugin — cycles backdrop images on the homepage from all media sources.
/// </summary>
public class Plugin : BasePlugin<BasePluginConfiguration>
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
    public override string Name => "Backdrop Extended";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("3c8f4c97-2bc5-4e68-a60c-4e3b4a24c4b0");

    /// <inheritdoc />
    public override string Description => "Extends Jellyfin's backdrop functionality with additional features, including cycling backdrop images on the homepage using all media sources.";
}
