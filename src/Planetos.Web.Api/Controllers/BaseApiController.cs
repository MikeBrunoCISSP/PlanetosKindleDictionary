using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Planetos.Shared;
using Planetos.Web.Api.Dto;
using Planetos.Web.Api.Extensions;

namespace Planetos.Web.Api.Controllers;

public class BaseApiController : Controller {
    protected static IActionResult GenerateResult(IServiceOperationResult result) {
        return result.GenerateActionResult();
    }
    protected IActionResult GenerateResult<T>(IServiceOperationResult<T> result) {
        return result.GenerateActionResult(Response);
    }

    protected IServiceOperationResult<IActionResult> ValidateModel(Object model) {
        var result = new ServiceOperationResult<IActionResult>();
        if (model == null) {
            result.HResult = ErrorCode.E_INVALIDARG;
            result.Value = BadRequest("The body is empty.");
            return result;
        }
        if (!ModelState.IsValid) {
            result.HResult = ErrorCode.E_BADFORMAT;
            var fault = new ApiResponseFaultDto();
            foreach (ModelError modelState in ModelState.Values.SelectMany(x => x.Errors)) {
                fault.Errors.Add(new ApiFaultEntry(ErrorCode.E_INVALIDARG, modelState.ErrorMessage));
            }
            result.Value = UnprocessableEntity(fault);
        }
        return result;
    }
    protected IServiceOperationResult<IActionResult> RevalidateModel(Object model) {
        ModelState.Clear();
        TryValidateModel(model);
        return ValidateModel(model);
    }
    public override void OnActionExecuting(ActionExecutingContext context) {
        if (!context.ModelState.IsValid) {
            var fault = new ApiResponseFaultDto();
            foreach (ModelError modelState in context.ModelState.Values.SelectMany(x => x.Errors)) {
                fault.Errors.Add(new ApiFaultEntry(ErrorCode.E_INVALIDARG, modelState.ErrorMessage));
            }

            context.Result = new UnprocessableEntityObjectResult(fault);
        }
    }
}
