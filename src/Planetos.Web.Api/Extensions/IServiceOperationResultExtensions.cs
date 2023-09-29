using System.Net;
using Microsoft.AspNetCore.Mvc;
using Planetos.Shared;
using Planetos.Web.Api.Dto;

namespace Planetos.Web.Api.Extensions;

public static class IServiceOperationResultExtensions {
    public static IActionResult GenerateActionResult(this IServiceOperationResult result) {
        var fault = new ApiResponseFaultDto();
        if (!result.IsSuccess) {
            fault.Errors.Add(result.ToApiFaultEntry());
        }

        return result.HResult switch {
            ErrorCode.E_SUCCESS => new NoContentResult(),
            ErrorCode.E_DUPLICATE => new ConflictObjectResult(fault),
            ErrorCode.E_INVALIDSTATE => new ConflictObjectResult(fault),
            ErrorCode.E_ACCESSDENIED => new ObjectResult(fault) { StatusCode = (Int32)HttpStatusCode.Forbidden },
            ErrorCode.E_LOGONFAILURE => new UnauthorizedObjectResult(fault),
            ErrorCode.E_NOTFOUND => new NotFoundObjectResult(fault),
            ErrorCode.E_EMPTY => new BadRequestObjectResult(fault),
            ErrorCode.E_INVALIDARG => new BadRequestObjectResult(fault),
            ErrorCode.E_BADFORMAT => new UnprocessableEntityObjectResult(fault),
            ErrorCode.E_AGENT_VERSION => new ObjectResult(fault) { StatusCode = (Int32)HttpStatusCode.UpgradeRequired },
            ErrorCode.E_NOT_SUPPORTED => new ObjectResult(fault) { StatusCode = (Int32)HttpStatusCode.NotImplemented },
            _ => new ObjectResult(fault) { StatusCode = (Int32)HttpStatusCode.InternalServerError }
        };
    }

    public static IActionResult GenerateActionResult<T>(this IServiceOperationResult<T> result, HttpResponse response = null) {
        if (result.IsSuccess) {
            if (result.Value == null) {
                return new NoContentResult();
            }

            if (result.PagerMetaData != null && response != null) {
                response.Headers.Add("X-Pagination", DataSerializer.SerializeObject(result.PagerMetaData));
            }

            return new OkObjectResult(result.Value);
        }

        return GenerateActionResult((IServiceOperationResult)result);
    }
    public static ApiFaultEntry ToApiFaultEntry(this IServiceOperationResult result) {
        return new ApiFaultEntry(result.HResult, result.ErrorMessage);
    }
}
