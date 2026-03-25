using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace SonnyTel.Plugin.MusicPlayerFixes.Api;

/// <summary>
/// Controller that serves the client-side JavaScript for the Music Player Fixes plugin.
/// </summary>
[ApiController]
[Route("MusicPlayerFixes")]
public class MusicPlayerFixesController : ControllerBase
{
    /// <summary>
    /// Serves the embedded Music Player Fixes client script.
    /// </summary>
    /// <returns>The JavaScript file content.</returns>
    [HttpGet("ClientScript")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetClientScript()
    {
        if (!ScriptInjector.IsPluginEnabled())
        {
            return NotFound();
        }

        var assembly = Assembly.GetExecutingAssembly();
        var resourceName = "SonnyTel.Plugin.MusicPlayerFixes.Web.musicPlayerFixes.js";

        var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var js = reader.ReadToEnd();

        return Content(js, "application/javascript");
    }
}
