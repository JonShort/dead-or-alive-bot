const { WIKIDATA_ERROR } = require('./constants');
const DeadOrAlive = require('./DeadOrAlive');

const parseTextFromCommand = (text, commandOffset) => {
    const command = text.substring(commandOffset.offset, commandOffset.length);
    const start = commandOffset.offset + commandOffset.length + 1;
    return {
        command,
        text: text.substring(start, text.length)
    };
};

const buildQueryResponse = searchTerm => new Promise(async (resolve) => {
    try {
        const results = await DeadOrAlive.searchQuery(searchTerm);

        return resolve(results.map((result, idx) => {
            const userFriendlyMessage = result.isDead
                ? `[${result.name}](${result.url}) died${result.hasDOB ? ` aged ${result.age}` : ''} on ${result.dateOfDeath}.`
                : `[${result.name}](${result.url}) is alive${result.hasDOB ? ` and kicking at ${result.age} years old` : ''}.`;

            return {
                description: userFriendlyMessage,
                id: idx,
                input_message_content: {
                    message_text: userFriendlyMessage,
                },
                title: result.name,
                type: 'article',
                url: result.url
            };
        }));
    } catch (e) {
        return resolve([]);
    }
});

const buildResponse = searchTerm => new Promise(async (resolve) => {
    try {
        const result = await DeadOrAlive.search(searchTerm);

        if (result.customMessage) {
            return resolve(result.customMessage);
        }

        if (result.isDead) {
            return resolve(`[${result.name}](${result.url}) died${result.hasDOB ? ` aged ${result.age}` : ''} on ${result.dateOfDeath}.`);
        }

        return resolve(`[${result.name}](${result.url}) is alive${result.hasDOB ? ` and kicking at ${result.age} years old` : ''}.`);
    } catch (e) {
        if (e.message === 'not-found') {
            return resolve(`Couldn't find a person named ${searchTerm}.`);
        }

        if (e.message === WIKIDATA_ERROR) {
            return resolve('Oops! The bot seems to be having issues - please open an issue at https://github.com/weiran/dead-or-alive-bot/issues (include your search term) and I\'ll take a look 👀😁');
        }

        return resolve(e.message);
    }
});

const textReceived = async (context) => {
    const { message } = context;
    let searchTerm = message.text;

    // parse command and input text
    if (message.entities !== undefined && message.entities.length > 0) {
        const commandOffset = message.entities[0];
        const { command, text } = parseTextFromCommand(searchTerm, commandOffset);

        switch (command) {
        case '/dead':
        case '/alive': {
            searchTerm = text;
            break;
        }
        default:
            return;
        }
    }

    const response = await buildResponse(searchTerm);

    context.replyWithMarkdown(response);
};

const queryReceived = async (context) => {
    // Don't attempt to search when no query is provided
    if (!context.inlineQuery.query || context.inlineQuery.query.length === 0) {
        return context.answerInlineQuery([]);
    }

    const userQuery = context.inlineQuery.query;
    const response = await buildQueryResponse(userQuery);

    return context.answerInlineQuery(response);
};

module.exports = {
    queryReceived,
    textReceived,
    _private: {
        buildResponse,
        buildQueryResponse,
        parseTextFromCommand
    }
};
