using Microsoft.AspNetCore.Mvc;
using Planetos.WebContract;

namespace Planetos.Web.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CharactersController : ControllerBase {
    [HttpGet]
    public JsonResult GetCharacters() {
        return new JsonResult(new List<WordDefinition>() {
            new()  {
                name = "Cercei",
                definition = "Dowager queen"
            },
            new()  {
                name = "Snow",
                definition = "Bastard of Winterfell"
            }
        });
    }
}
