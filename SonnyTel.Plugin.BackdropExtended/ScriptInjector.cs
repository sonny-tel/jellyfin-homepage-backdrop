using System.Text;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace SonnyTel.Plugin.BackdropExtended;

/// <summary>
/// Injects the client-side script tag into the Jellyfin web client's index.html on startup
/// and removes it on shutdown.
/// </summary>
public sealed class ScriptInjector : IHostedService
{
    private const string ScriptTag = "<script src=\"/BackdropExtended/ClientScript\"></script>";
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
        InjectScript();
        return Task.CompletedTask;
    }

    /// <inheritdoc />
    public Task StopAsync(CancellationToken cancellationToken)
    {
        RemoveScript();
        return Task.CompletedTask;
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
                _logger.LogDebug("Backdrop Extended script tag already present in index.html");
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

            _logger.LogInformation("Backdrop Extended script injected into index.html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to inject Backdrop Extended script into index.html");
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

            _logger.LogInformation("Backdrop Extended script removed from index.html");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to remove Backdrop Extended script from index.html");
        }
    }
}
