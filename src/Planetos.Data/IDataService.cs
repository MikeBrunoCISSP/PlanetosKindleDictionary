using Planetos.Shared;

namespace Planetos.Data;
interface IDataService : IDisposable {
    Task<IServiceOperationResult> AddCharacter(string name, string definition);
    Task<IServiceOperationResult> UpdateCharacter(string name, string definition);
    Task<IServiceOperationResult> DeleteCharacter(string name);
    Task<IServiceOperationResult> AddLocation(string name, string definition);
    Task<IServiceOperationResult> UpdateLocation(string name, string definition);
    Task<IServiceOperationResult> DeleteLocation(string name);
}
