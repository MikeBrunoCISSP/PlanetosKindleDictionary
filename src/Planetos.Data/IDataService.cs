using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public interface IDataService : IDisposable {
    Task<IServiceOperationResult<WordDefinition>> AddWord(int indexId, string name, string definition);
    Task<IServiceOperationResult<WordDefinition>> AddWord(WordDefinition dto);
    Task<IServiceOperationResult<KindleIndex>> AddIndex(String indexName);
    Task<IServiceOperationResult<WordDefinition>> ReadWord(string name);
    Task<IServiceOperationResult<WordDefinition>> ReadWord(int wordDefinitionId);
    Task<IServiceOperationResult<IEnumerable<WordDefinition>>> ReadIndex(int indexId, string searchPattern = "");
    Task<IServiceOperationResult<WordDefinition>> UpdateWord(WordDefinition updatedWord);
    Task<IServiceOperationResult> DeleteWord(string name);
    Task<IServiceOperationResult> DeleteIndex(string indexName);
    Task<IServiceOperationResult> DeleteAll();
}
