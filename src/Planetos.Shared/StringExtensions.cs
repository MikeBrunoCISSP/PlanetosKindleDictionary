using System.Text.RegularExpressions;

namespace Planetos.Shared;
public static class StringExtensions {
    static readonly Regex _rgxNonAlpha = new Regex("[^a-zA-Z]");

    public static IServiceOperationResult<T> TestValidIdentifier<T>(this String identifier) {
        var result = new ServiceOperationResult<T>();
        if (_rgxNonAlpha.IsMatch(identifier)) {
            result.HResult = ErrorCode.E_BADFORMAT;
            result.ErrorMessage = $"{identifier}: Non-alpha characters or spaces are not allowed.";
        }

        return result;
    }
    public static IServiceOperationResult TestValidIdentifier(this String identifier) {
        var result = new ServiceOperationResult();
        if (_rgxNonAlpha.IsMatch(identifier)) {
            result.HResult = ErrorCode.E_BADFORMAT;
            result.ErrorMessage = $"{identifier}: Non-alpha characters or spaces are not allowed.";
        }

        return result;
    }
}
