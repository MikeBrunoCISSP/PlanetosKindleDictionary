using System.ComponentModel;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace Planetos.Shared;
public static class ExceptionExtensions {
    public static void SetErrorCode(this Exception ex, IServiceOperationResult result) {
        switch (ex) {
            case Win32Exception wex:
                result.HResult = wex.NativeErrorCode;
                result.ErrorMessage = wex.Message.StartsWith("Unknown error")
                    ? ex.Message
                    : wex.Message;
                return;
            case NullReferenceException _:
                result.HResult = ErrorCode.E_NULLPARAMETER;
                break;
            case DbUpdateConcurrencyException:
                result.HResult = ErrorCode.E_INVALIDSTATE;
                result.ErrorMessage = ex.Message;
                return;
        }

        if (ex.InnerException is not SqlException sqlEx) {
            result.HResult = ex.HResult;
            result.ErrorMessage = ex.Message;
            return;
        }
        result.HResult = sqlEx.Number switch {
            2601 => ErrorCode.E_DUPLICATE,
            547 => ErrorCode.E_INVALIDARG,
            _ => ErrorCode.E_UNEXPECTED
        };
        result.ErrorMessage = sqlEx.Message;
    }
}
