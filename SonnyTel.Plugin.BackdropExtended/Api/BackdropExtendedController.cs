using System.Net.Mime;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace SonnyTel.Plugin.BackdropExtended.Api;

/// <summary>
/// Controller that serves the client-side JavaScript for the Backdrop Extended plugin.
/// </summary>
[ApiController]
[Route("BackdropExtended")]
public class BackdropExtendedController : ControllerBase
{
    /// <summary>
    /// Serves the embedded Backdrop Extended client script.
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
        var resourceName = "SonnyTel.Plugin.BackdropExtended.Web.backdropExtended.js";

        var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
        {
            return NotFound();
        }

        using var reader = new StreamReader(stream);
        var js = reader.ReadToEnd();

        var config = Plugin.Instance?.Configuration;
        var maxRatingEnabled = config?.MaxRatingEnabled ?? true;
        js = js.Replace("%BACKDROP_EXTENDED_CONFIG%", maxRatingEnabled ? "true" : "false");

        return Content(js, "application/javascript");
    }
}
