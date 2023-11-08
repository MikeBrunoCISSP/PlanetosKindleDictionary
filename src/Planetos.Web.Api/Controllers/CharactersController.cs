using Microsoft.AspNetCore.Mvc;
using Planetos.Data;
using Planetos.Shared;

namespace Planetos.Web.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CharactersController : BaseApiController {
    readonly IDataService _dataService;
    readonly ILogger<CharactersController> _logger;

    public CharactersController(IDataService dataService, ILogger<CharactersController> logger) {
        _dataService = dataService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetCharacters() {
        return GenerateResult(await _dataService.ReadIndex(IndexId.Characters));
    }
}
