using System.ComponentModel;
using X.PagedList;

namespace Planetos.Shared;
public class ServiceOperationResult : IServiceOperationResult {
    Int32 hresult;
    String msg;

    public ServiceOperationResult() { }
    public ServiceOperationResult(Int32 hresult) {
        HResult = hresult;
    }

    public Int32 HResult {
        get => hresult;
        set {
            hresult = value;
            switch (hresult) {
                case ErrorCode.E_INVALIDSTATE:
                    msg = "Operation is not valid due to the current state of the object.";
                    break;
            }
        }
    }
    public String ErrorMessage {
        get => String.IsNullOrEmpty(msg) ? new Win32Exception(HResult).Message : msg;
        set => msg = value;
    }
    public Boolean IsSuccess => HResult == ErrorCode.E_SUCCESS;

    public void CopyFromFault(IServiceOperationResult faultResult) {
        if (faultResult == null) {
            return;
        }

        hresult = faultResult.HResult;
        msg = faultResult.ErrorMessage;
    }
}
public class ServiceOperationResult<TValue> : ServiceOperationResult, IServiceOperationResult<TValue> {
    public ServiceOperationResult() { }
    public ServiceOperationResult(Int32 hresult) : base(hresult) { }

    public TValue Value { get; set; }
    public IPagedList PagerMetaData { get; set; }
}
