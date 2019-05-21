import numpy as np
import torch
import torch.nn.functional as F
from tqdm import tqdm

from pytorch_pretrained_bert import GPT2LMHeadModel, GPT2Tokenizer

enc = GPT2Tokenizer.from_pretrained("gpt2")
model = GPT2LMHeadModel.from_pretrained("gpt2")
model.eval()


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
