using System.Reflection;
using System.Text;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace SonnyTel.Plugin.MusicPlayerFixes;

/// <summary>
/// Injects the client-side script tag into the Jellyfin web client's index.html on startup
/// and removes it on shutdown.
/// </summary>
public sealed class ScriptInjector : IHostedService
{
    private const string ScriptTag = "<script src=\"/MusicPlayerFixes/ClientScript\"></script>";
    private readonly IApplicationPaths _applicationPaths;
    private readonly ILogger<ScriptInjector> _logger;

    /// <summary>
    /// Initializes a new instance of the <see cref="ScriptInjector"/> class.
    /// </summary>
    /// <param name="applicationPaths">Instance of the <see cref="IApplicationPaths"/> interface.</param>
    /// <param name="logger">Instance of the <see cref="ILogger{ScriptInjector}"/> interface.</param>
    public ScriptInjector(IApplicationPaths applicationPaths, ILogger<ScriptInjector> logger)
    {
        _applicationPaths = applicationPaths;
        _logger = logger;
    }

    /// <inheritdoc />
    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (IsPluginEnabled())
        {
            InjectScript();
        }
        else
        {
            _logger.LogInformation("Music Player Fixes plugin is disabled, removing script tag if present");
            RemoveScript();
        }

        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        RemoveScript();
        return Task.CompletedTask;
    }

    /// <summary>
    /// Checks whether the plugin is enabled by reading the status from meta.json.
    /// PluginStatus.Active == 0. Any other value means the plugin is disabled/inactive.
    /// </summary>
    internal static bool IsPluginEnabled()
    {
        try
        {
            var assemblyDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            if (assemblyDir is null)
            {
                return true;
            }

            var metaPath = Path.Combine(assemblyDir, "meta.json");
            if (!File.Exists(metaPath))
            {
                return true;
            }

            using var doc = JsonDocument.Parse(File.ReadAllBytes(metaPath));
            if (doc.RootElement.TryGetProperty("status", out var statusProp)
                && statusProp.ValueKind == JsonValueKind.Number)
            {
                return statusProp.GetInt32() == 0; // 0 = Active
            }

            return true;
        }
        catch
        {
            return true; // assume enabled if we can't determine status
        }
    }

    private string GetIndexPath()
    {
        return Path.Combine(_applicationPaths.WebPath, "index.html");
    }

    private void InjectScript()
    {
        try
        {
            var indexPath = GetIndexPath();
            if (!File.Exists(indexPath))
            {
                _logger.LogWarning("Web client index.html not found at {Path}, skipping script injection", indexPath);
                return;
            }

            var html = File.ReadAllText(indexPath, Encoding.UTF8);

            if (html.Contains(ScriptTag, StringComparison.Ordinal))
            {
                _logger.LogDebug("Music Player Fixes script tag already present in index.html");
                return;
            }

            const string closingBody = "</body>";
            var insertIndex = html.LastIndexOf(closingBody, StringComparison.OrdinalIgnoreCase);
            if (insertIndex < 0)
            {
                _logger.LogWarning("Could not find </body> tag in index.html, skipping script injection");
                return;
            }

            html = html.Insert(insertIndex, $"    {ScriptTag}\n");
            File.WriteAllText(indexPath, html, Encoding.UTF8);

            _logger.LogInformation("Music Player Fixes script injected into index.html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to inject Music Player Fixes script into index.html");
        }
    }

    private void RemoveScript()
    {
        try
        {
            var indexPath = GetIndexPath();
            if (!File.Exists(indexPath))
            {
                return;
            }

            var html = File.ReadAllText(indexPath, Encoding.UTF8);

            if (!html.Contains(ScriptTag, StringComparison.Ordinal))
            {
                return;
            }

            html = html.Replace($"    {ScriptTag}\n", string.Empty, StringComparison.Ordinal);
            File.WriteAllText(indexPath, html, Encoding.UTF8);

            _logger.LogInformation("Music Player Fixes script removed from index.html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove Music Player Fixes script from index.html");
        }
    }
}
