using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public interface IDataService : IDisposable {
    Task<IServiceOperationResult<WordDefinition>> CreateWord(string indexName, string name, string definition);
    Task<IServiceOperationResult<KindleIndex>> CreateIndex(String indexName);
    Task<IServiceOperationResult<WordDefinition>> ReadWord(string name);
    Task<IServiceOperationResult<WordDefinition>> UpdateWord(string name, string newDefinition);
    Task<IServiceOperationResult> DeleteWord(string name);
    Task<IServiceOperationResult> DeleteIndex(string indexName);
    Task<IServiceOperationResult> DeleteAll();
}
