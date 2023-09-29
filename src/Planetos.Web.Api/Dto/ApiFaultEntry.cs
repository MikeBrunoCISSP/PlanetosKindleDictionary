namespace Planetos.Web.Api.Dto;

class ApiResponseFaultDto {
    public List<ApiFaultEntry> Errors { get; set; } = new();
}

public class ApiFaultEntry {
    public ApiFaultEntry(Int32 errorCode, String message) {
        ErrorCode = errorCode;
        Message = message;
    }

    public Int32 ErrorCode { get; set; }
    public String Message { get; set; }
}
