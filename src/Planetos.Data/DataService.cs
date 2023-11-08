using Microsoft.EntityFrameworkCore;
using Planetos.Data.Models;
using Planetos.Shared;

namespace Planetos.Data;
public class DataService : IDataService {
    readonly PlanetosContext _context;
    public DataService() {
        _context = new PlanetosContext();
    }

    public async Task<IServiceOperationResult<WordDefinition>> AddWord(int indexId, string name, string definition) {
        var result = name.TestValidIdentifier<WordDefinition>();
        if (!result.IsSuccess) {
            return result;
        }

        var idxResult = await getKindleIndex(indexId);
        if (!idxResult.IsSuccess) {
            result.HResult = idxResult.HResult;
            result.ErrorMessage = idxResult.ErrorMessage;
            return result;
        }

        var word = new WordDefinition {
            name = name,
            definition = definition,
            kindleIndexId = idxResult.Value.kindleIndexId
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

    public async Task<IServiceOperationResult<WordDefinition>> AddWord(WordDefinition dto) {
        var result = new ServiceOperationResult<WordDefinition>();

        try {
            await _context.wordDefinitions.AddAsync(dto);
            await _context.SaveChangesAsync();
            result.Value = dto;
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<KindleIndex>> AddIndex(String indexName) {
        var result = indexName.TestValidIdentifier<KindleIndex>();
        if (!result.IsSuccess) {
            return result;
        }
        try {
            var idxResult = await testKindleIndexName(indexName);
            if (!idxResult.IsSuccess) {
                result.HResult = idxResult.HResult;
                result.ErrorMessage = idxResult.ErrorMessage;
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

    public async Task<IServiceOperationResult<WordDefinition>> ReadWord(int wordDefinitionId) {
        var result = new ServiceOperationResult<WordDefinition>();
        try {
            IQueryable<WordDefinition> query = _context.wordDefinitions;
            var word = await query.FirstOrDefaultAsync(w => w.id == wordDefinitionId);
            if (word is null) {
                result.HResult = ErrorCode.E_FILENOTFOUND;
                result.ErrorMessage = $"{wordDefinitionId}: Not a valid word ID.";
            } else {
                result.Value = word;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<IEnumerable<WordDefinition>>> ReadIndex(int indexId, string searchPattern = "") {
        var result = new ServiceOperationResult<IEnumerable<WordDefinition>>();
        try {
            var index = await getKindleIndex(indexId);
            if (!index.IsSuccess) {
                result.HResult = index.HResult;
                result.ErrorMessage = index.ErrorMessage;
                return result;
            }

            if (String.IsNullOrEmpty(searchPattern)) {
                var payload = _context.wordDefinitions.Where(w => w.kindleIndexId == index.Value.kindleIndexId).AsEnumerable();
                result.Value = payload;
            } else {
                var payload = _context.wordDefinitions.Where(w => w.kindleIndexId == index.Value.kindleIndexId
                && w.name.Contains(searchPattern, StringComparison.OrdinalIgnoreCase)).AsEnumerable();
                result.Value = payload;
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public async Task<IServiceOperationResult<WordDefinition>> UpdateWord(WordDefinition updatedWord) {
        var result = new ServiceOperationResult<WordDefinition>();

        try {
            var findResult = await _context.wordDefinitions.FindAsync(updatedWord.id);
            if (findResult == null) {
                result.HResult = ErrorCode.E_NOTFOUND;
                return result;
            }
            _context.Entry(findResult).CurrentValues.SetValues(updatedWord);
            await _context.SaveChangesAsync();
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
        var findResult = await getKindleIndex(indexName);
        if (!findResult.IsSuccess) {
            return findResult;
        }

        var result = new ServiceOperationResult();
        try {
            var indexToDelete = findResult.Value;
            await _context.wordDefinitions.Where(w => w.kindleIndexId == indexToDelete.kindleIndexId).ExecuteDeleteAsync();
            int rowsEffected = await _context.indices.Where(i => i.kindleIndexId == indexToDelete.kindleIndexId).ExecuteDeleteAsync();
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
            await _context.wordDefinitions.ExecuteDeleteAsync();
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    async Task<IServiceOperationResult<KindleIndex>> getKindleIndex(int indexId) {
        var result = new ServiceOperationResult<KindleIndex>();
        if (indexId is < 1 or > 4) {
            result.HResult = ErrorCode.E_INVALIDARG;
            result.ErrorMessage = $"{indexId}: Not a valid Kindle index id.";
            return result;
        }
        try {
            var kindleIndex = await _context.indices.FirstOrDefaultAsync(idx => idx.kindleIndexId == indexId);
            if (kindleIndex is not null) {
                result.Value = kindleIndex;
                return result;
            }

            result.HResult = ErrorCode.E_NOTFOUND;
            result.ErrorMessage = $"{indexId}: Not a valid Kindle index id.";
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    async Task<IServiceOperationResult> testKindleIndexName(String indexName) {
        var result = indexName.TestValidIdentifier();
        if (!result.IsSuccess) {
            return result;
        }

        try {
            var existingIndex = await _context.indices.FirstOrDefaultAsync(idx => idx.name == indexName);
            if (existingIndex != null) {
                result.HResult = ErrorCode.E_DUPLICATE;
                result.ErrorMessage = $"{indexName}: Index already exists.";
            }
        } catch (Exception ex) {
            ex.SetErrorCode(result);
        }

        return result;
    }

    public void Dispose() {
        _context.Dispose();
    }
}
