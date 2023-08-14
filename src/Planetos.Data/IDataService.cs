using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
interface IDataService : IDisposable {
    Task<IServiceOperationResult> CreateWord(string indexName, string name, string definition);
    Task<IServiceOperationResult<WordDefinition>> ReadWord(string name);
    Task<IServiceOperationResult> UpdateWord(string name, string newDefinition);
    Task<IServiceOperationResult> DeleteWord(string name);
}
