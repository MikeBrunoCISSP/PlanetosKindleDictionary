using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public class DataService : IDataService {
    readonly PlanetosContext _context;
    public DataService() {
        _context = new PlanetosContext();
    }

    public async Task<IServiceOperationResult<WordDefinition>> CreateWord(string indexName, string name, string definition) {
        var result = name.TestValidIdentifier<WordDefinition>();
        if (!result.IsSuccess) {
            return result;
        }

        var idxResult = await getDictionaryIndex(indexName);
        if (!idxResult.IsSuccess) {
            result.HResult = idxResult.HResult;
            result.ErrorMessage = idxResult.ErrorMessage;
            return result;
        }

        var word = new WordDefinition {
            name = name,
            definition = definition
        };
        try {
            idxResult.Value.wordDefinitions.Add(word);
            await _context.SaveChangesAsync();
            result.Value = word;
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<KindleIndex>> CreateIndex(String indexName) {
        var result = indexName.TestValidIdentifier<KindleIndex>();
        if (!result.IsSuccess) {
            return result;
        }
        try {
            var idxResult = await getDictionaryIndex(indexName);
            if ((await getDictionaryIndex(indexName)).HResult != ErrorCode.E_NOTFOUND) {
                result.HResult = ErrorCode.E_DUPLICATE;
                result.ErrorMessage = $"{indexName}: Index exists.";
                return result;
            }

            var kindleIndex = new KindleIndex { name = indexName };
            await _context.indices.AddAsync(kindleIndex);
            await _context.SaveChangesAsync();
            result.Value = kindleIndex;
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<WordDefinition>> ReadWord(string name) {
        var result = new ServiceOperationResult<WordDefinition>();
        try {
            IQueryable<WordDefinition> query = _context.wordDefinitions;
            var word = await query.FirstOrDefaultAsync(x => x.name == name);
            if (word is null) {
                result.HResult = ErrorCode.E_FILENOTFOUND;
                result.ErrorMessage = $"'{name}': Word does not exist.";
            } else {
                result.Value = word;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<WordDefinition>> UpdateWord(string name, string newDefinition) {
        var result = name.TestValidIdentifier<WordDefinition>();
        if (!result.IsSuccess) {
            return result;
        }

        try {
            var findResult = await ReadWord(name);
            if (!findResult.IsSuccess) {
                return new ServiceOperationResult<WordDefinition>(findResult.HResult);
            }
            findResult.Value.definition = newDefinition;
            await _context.SaveChangesAsync();
            result.Value = findResult.Value;
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult> DeleteWord(string name) {
        var result = new ServiceOperationResult();
        try {
            int delResult = await _context.wordDefinitions.Where(w => w.name == name).ExecuteDeleteAsync();
            if (delResult != 1) {
                result.HResult = ErrorCode.E_UNEXPECTED;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult> DeleteIndex(string indexName) {
        var findResult = await getDictionaryIndex(indexName);
        if (!findResult.IsSuccess) {
            return findResult;
        }

        var result = new ServiceOperationResult();
        try {
            var indexToDelete = findResult.Value;
            await _context.wordDefinitions.Where(w => w.indexId == indexToDelete.id).ExecuteDeleteAsync();
            int rowsEffected = await _context.indices.Where(i => i.id == indexToDelete.id).ExecuteDeleteAsync();
            if (rowsEffected != 1) {
                result.HResult = ErrorCode.E_UNEXPECTED;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult> DeleteAll() {
        var result = new ServiceOperationResult();
        try {
            await _context.inflections.ExecuteDeleteAsync();
            await _context.inflectionGroups.ExecuteDeleteAsync();
            await _context.wordDefinitions.ExecuteDeleteAsync();
            await _context.indices.ExecuteDeleteAsync();
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    async Task<IServiceOperationResult<KindleIndex>> getDictionaryIndex(string indexName) {
        var result = indexName.TestValidIdentifier<KindleIndex>();
        if (!result.IsSuccess) {
            return result;
        }
        try {
            var charIdx = await _context.indices.FirstOrDefaultAsync(idx => idx.name == indexName);
            if (charIdx is not null) {
                result.Value = charIdx;
                return result;
            }

            result.HResult = ErrorCode.E_NOTFOUND;
            result.ErrorMessage = $"{indexName}: Index not found.";
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public void Dispose() {
        _context.Dispose();
    }
}
