import regex as re
import torch

from pytorch_pretrained_bert import GPT2LMHeadModel, GPT2Tokenizer

enc = GPT2Tokenizer.from_pretrained("gpt2")
model = GPT2LMHeadModel.from_pretrained("gpt2")
model.eval()

# Monkey-patch to fix https://github.com/huggingface/pytorch-pretrained-BERT/issues/537
def tokenize(self, text):
    """ Tokenize a string. """
    bpe_tokens = []
    for token in re.findall(self.pat, text):
        token = "".join(self.byte_encoder[b] for b in token.encode("utf-8"))
        bpe_tokens.extend(bpe_token for bpe_token in self.bpe(token).split(" "))
    return bpe_tokens


GPT2Tokenizer.tokenize = tokenize


def nll(phrase, prefix=". "):
    return nll_raw(". " + phrase)


def nll_raw(text):
    context_tokens = enc.encode(text)
    batch_size = 1
    context = (
        torch.tensor(context_tokens, dtype=torch.long)
        .unsqueeze(0)
        .repeat(batch_size, 1)
    )
    with torch.no_grad():
        return model(context, lm_labels=context).item() * len(context_tokens)
