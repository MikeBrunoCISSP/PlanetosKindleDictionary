using X.PagedList;

namespace Planetos.Shared;
public interface IServiceOperationResult {
    Int32 HResult { get; set; }
    String ErrorMessage { get; set; }
    Boolean IsSuccess { get; }
}

public interface IServiceOperationResult<T> : IServiceOperationResult {
    T Value { get; set; }
    IPagedList PagerMetaData { get; set; }
}
